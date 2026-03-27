const { ipcMain, app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const argon2 = require("argon2");
const { randomBytes, createCipheriv, createDecipheriv, createHmac } = require("crypto");
const secp = require('secp256k1');
const hmac = (data, key) => createHmac("sha512", key).update(data).digest();
const SECP256K1_N = BigInt( "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141" );
const Web3 = require('web3').default;
const { TypedDataUtils, SignTypedDataVersion } = require("@metamask/eth-sig-util");
const { ecsign, toRpcSig } = require("ethereumjs-util");
const web3 = new Web3("http://127.0.0.1:8545");

let win;

const cookie = fs.readFileSync(`${process.env.HOME}/.bitcoin/.cookie`, "utf8").trim();
const BTC_RPC_URL = "http://127.0.0.1:8332/"
const bitcoin = require('bitcoinjs-lib')
const network = bitcoin.networks.bitcoin

function getAddress(pubKey) {
  const { address } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(pubKey, 'hex'), network })
  return address
}

async function bitcoin_fetch(method, params=[]) {
  const body = JSON.stringify({ jsonrpc: "1.0", id: "js", method, params });

  const auth = Buffer.from(cookie).toString("base64");

  const res = await fetch(BTC_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Authorization": `Basic ${auth}`,
    },
    body,
  });

  const json = await res.json();
  if (json.error) return { error: true, message: json.error.message}
  return json.result;
}
ipcMain.handle('get-feerate', async (event) => {
  const feerate = await bitcoin_fetch('estimatesmartfee', [1])
  return parseInt(feerate.feerate * 100_000) ? parseInt(feerate.feerate * 100_000) : 1
})

ipcMain.handle('sign-tx', async (event, tx, signers, password, coldSpend) => {
  try {
    tx = bitcoin.Psbt.fromBase64(tx)
    if (coldSpend) {
      coldWalletPath = await pickFile()
      if (!coldWalletPath) {
        return "Cold wallet path required.";
      }
      var keys = await get_keys(password, "btc", coldWalletPath)
      if (!keys) return "Invalid cold wallet"
    }
    else {
      var keys = await get_keys(password, "btc")
    }
    for (var i = 0; i < tx.data.inputs.length; i++) {
      var privKey = keys[keys.findIndex(k => getAddress(secp.publicKeyCreate(Buffer.from(k.trim(), 'hex'), true)) === signers[i])].trim()
      var pubKey = secp.publicKeyCreate(Buffer.from(privKey, 'hex'), true)
      const signer = {
        publicKey: pubKey,
        sign: (hash) => {
          return secp.ecdsaSign(hash, Buffer.from(privKey, 'hex')).signature;
        }
      };
      tx.signInput(i, signer)
    }
    tx.finalizeAllInputs()
    return tx.extractTransaction().toHex()
  }
  catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('send-tx', async (event, tx, signers, password, coldSpend) => {
  return await bitcoin_fetch('sendrawtransaction', [tx])
})

ipcMain.handle('btc-balances', async (event, hotAddresses, coldAddresses, password, nonce) => {
  if (!fs.existsSync('btc_utxos.json')) {
    var btc_utxos = { checkpoint: 0, finalized: { hot: [], cold: [] }, pending: { hot: [], cold: [] } }
  }
  else {
    var btc_utxos = JSON.parse(await decrypt(fs.readFileSync('btc_utxos.json', 'utf-8'), password));
    btc_utxos.pending = { hot: [], cold: [] };
  }

  const checkpoint = btc_utxos.checkpoint || 0;

  try {
    const bestblockhash = await bitcoin_fetch('getbestblockhash');
    const current = (await bitcoin_fetch('getblock', [bestblockhash])).height;

    if (checkpoint === 0) {
      fs.writeFileSync('btc_utxos.json', JSON.stringify({ ...btc_utxos, checkpoint: current }));
      return { hot: [], cold: [] };
    }
    var start = Date.now()
    var remaining = (current - checkpoint) + 1
    for (let i = 0; i <= current - checkpoint; i++) {

      var now = Date.now()
      if (now - start > 1000) {
        start = now
        progress = (i / remaining) * 100;
        await win.webContents.send('status-update', progress, nonce);
      }

      const blockHeight = checkpoint + i;
      const hash = await bitcoin_fetch('getblockhash', [blockHeight]);
      const block = await bitcoin_fetch('getblock', [hash, 2]);

      const isPendingBlock = blockHeight > current - 5;

      for (const tx of block.tx) {
        for (const txout of tx.vout) {
          if (txout.scriptPubKey.type !== "witness_v0_keyhash") continue;

          const addr = txout.scriptPubKey.address;
          txout.hash = tx.txid;

          let list;
          if (hotAddresses.includes(addr)) {
            list = isPendingBlock ? btc_utxos.pending.hot : btc_utxos.finalized.hot;
          } else if (coldAddresses.includes(addr)) {
            list = isPendingBlock ? btc_utxos.pending.cold : btc_utxos.finalized.cold;
          } else {
            continue;
          }

          const exists = list.some(u => u.hash === txout.hash && u.n === txout.n);
          if (!exists) list.push(txout);
        }

        const allLists = [
          btc_utxos.pending.hot,
          btc_utxos.pending.cold,
          btc_utxos.finalized.hot,
          btc_utxos.finalized.cold
        ];

        for (const txin of tx.vin) {
          for (const list of allLists) {
            const index = list.findIndex(u => u.hash === txin.txid && u.n === txin.vout);
            if (index !== -1) list.splice(index, 1);
          }
        }
      }
    }

    fs.writeFileSync('btc_utxos.json', await encrypt(JSON.stringify({ ...btc_utxos, checkpoint: current - 5 }), password));

    return {
      hot: btc_utxos.finalized.hot.concat(btc_utxos.pending.hot),
      cold: btc_utxos.finalized.cold.concat(btc_utxos.pending.cold)
    };

  } catch (err) {
    console.error(err.message);
    return false;
  }
});

ipcMain.handle('get-wallet', async (event, password, type) => {
  try {
    const data = fs.readFileSync('wallet.json', 'utf8');
    if (!data) {
      return false
    }
    else if (!password) {
      return true
    }
    const wallet = JSON.parse(await decrypt(data, password));
    if (type == "eth") {
      return { hotKeys: wallet.ethereumHotKeys.slice(1).map(priv => secp.publicKeyCreate(Buffer.from(priv, 'hex'), false)), coldKeys: wallet.ethereumColdKeys };
    }
    else if (type == "dApp") {
      return secp.publicKeyCreate(Buffer.from(wallet.ethereumHotKeys[0], 'hex'), false);
    }
    else if (type == "btc") {
      return { hotKeys: wallet.bitcoinHotKeys.map(key => { return secp.publicKeyCreate(Buffer.from(key, 'hex'), true) }), coldKeys: wallet.bitcoinColdKeys };
    }
    else {
      return wallet;
    }
  } catch (e) {
    console.error(e)
    return false
  }
})

async function get_keys(password, type, coldWalletPath) {
  try {
    const data = fs.readFileSync("wallet.json", 'utf8');
    const wallet = JSON.parse(await decrypt(data, password));
    if (coldWalletPath) {
      const data = fs.readFileSync(coldWalletPath, 'utf8');
      const coldwallet = JSON.parse(await decrypt(data, password));
      if (type == "eth") {
        var parentKey = CKDPriv({ key: Buffer.from(coldwallet.ethereumColdAccount.key, "hex"), code: Buffer.from(coldwallet.ethereumColdAccount.code, "hex")}, 0 | HARDENED)
        var keys = []
        for (var i = 0; i < wallet.ethereumColdKeys.length; i++) {
          keys.push(hexAndPad(CKDPriv({ key: parentKey.key, code: parentKey.code }, i).key))
        }
        return keys
      }
      else {
        var parentKey = CKDPriv({ key: Buffer.from(coldwallet.bitcoinColdAccount.key, "hex"), code: Buffer.from(coldwallet.bitcoinColdAccount.code, "hex")}, 0 | HARDENED)
        var keys = []
        for (var i = 0; i < wallet.bitcoinColdKeys.length; i++) {
          keys.push(hexAndPad(CKDPriv({ key: parentKey.key, code: parentKey.code }, i).key))
        }
        return keys
      }
    }
    else {
      if (type == "eth") {
        return wallet.ethereumHotKeys.slice(1)
      }
      else {
        return wallet.bitcoinHotKeys
      }
    }
  }
  catch (err) {
    console.error(err)
    return false
  }
}

ipcMain.handle('sign-for-dapp', async (event, type, payload, password) => {
  const data = fs.readFileSync('wallet.json', 'utf8');
  const wallet = JSON.parse(await decrypt(data, password));
  const privKey = wallet.ethereumHotKeys[0];
  switch (type) {
    case "sign":
      return (await web3.eth.accounts.sign(payload, "0x" + privKey)).signature

    case "send":
      return (await web3.eth.accounts.signTransaction(payload, "0x" + privKey)).rawTransaction

    case "typed": {
      if ( !payload || !payload.domain || !payload.types || !payload.primaryType || !payload.message ) {
        return "Invalid typed data"
      }

      const digest = TypedDataUtils.eip712Hash(payload, SignTypedDataVersion.V4)

      const { v, r, s } = ecsign(digest, Uint8Array.fromHex(privKey))
      return toRpcSig(v, r, s)
    }
  }
})

ipcMain.handle('construct-txs', async (event, { spenders, receiver, maxPriority, maxFee, }, password, coldSpend) => {
  if (coldSpend) {
    var coldWalletPath = await pickFile()
    if (!coldWalletPath) {
      return "Cold wallet path required.";
    }
    var coldWallet = await get_keys(password, "eth", coldWalletPath)
    if (!coldWallet) return "Invalid cold wallet"
    spenders = spenders.map((spender) => { return { ...spender, key: coldWallet[spender.index] }})
  }
  else {
    var hotKeys = await get_keys(password, "eth")
    if (!hotKeys) return "Invalid hot wallet"
    spenders = spenders.map((spender) => {
      return { ...spender, key: hotKeys[spender.index] }
    })
  }
  var txs = []
  for (var from of spenders) {
    const tx = {
      from: from.address,
      to: receiver,
      value: from.spend,
      nonce: from.nonce,
      gas: 21_000,
      maxPriorityFeePerGas: maxPriority,
      maxFeePerGas: maxFee
    };
    txs.push({ signed: await web3.eth.accounts.signTransaction(tx, from.key), tx: tx })
  }
  return txs
})

const HARDENED = 0x80000000;
const SECP_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");

function CKDPriv(node, index) {
  const kPar = node.key;
  const cPar = node.code;
  const hardened = (index & HARDENED) !== 0;

  let data;
  if (hardened) {
    data = Buffer.concat([Buffer.from([0x00]), kPar, intToBytes(index)]);
  } else {
    const pub = secp.publicKeyCreate(kPar, true);
    data = Buffer.concat([pub, intToBytes(index)]);
  }

  const I = hmac(data, cPar);
  const IL = BigInt("0x" + I.slice(0, 32).toString("hex"));
  const IR = I.slice(32);

  if (IL >= SECP_N) throw new Error("Invalid child");

  const k = (IL + BigInt("0x" + kPar.toString("hex"))) % SECP_N;
  if (k === 0n) throw new Error("Invalid key");

  return {
    key: Buffer.from(k.toString(16).padStart(64, "0"), "hex"),
    code: IR
  };
}
function CKDPub(node, index, compressed) {
  const kPar = secp.publicKeyConvert(Buffer.from(node.key, "hex"), true);
  const cPar = node.code;
  if (index & HARDENED) throw new Error("Cannot derive hardened from xpub");

  const data = Buffer.concat([kPar, intToBytes(index)]);
  const I = hmac(data, cPar);

  const IL = I.slice(0, 32);
  const IR = I.slice(32);

  if (BigInt("0x" + IL.toString("hex")) >= SECP_N) throw new Error("Invalid IL");

  const child = secp.publicKeyTweakAdd(kPar, IL, true);

  if (!child) throw new Error("Invalid public derivation");

  return {
    key: compressed ? Buffer.from(secp.publicKeyConvert(child, true)).toString('hex') : Buffer.from(secp.publicKeyConvert(child, false)).toString('hex'),
    code: IR
  };
}

function intToBytes(i) {
  return Buffer.from([
    (i >> 24) & 0xff,
    (i >> 16) & 0xff,
    (i >> 8) & 0xff,
    i & 0xff
  ]);
}

function hexAndPad(data) {
  return data.toString('hex').padStart(64, "0")
}

function deriveFromSeed(seed) {
  const I = hmac(seed, Buffer.from("Bitcoin seed"));
  const bip44path = CKDPriv({key: I.slice(0, 32), code: I.slice(32)}, 44 | HARDENED)

  const ethereumPath = CKDPriv(bip44path, 60 | HARDENED)
  const ethereumHotAccount = CKDPriv(ethereumPath, 0 | HARDENED)
  const ethereumHotWallet = CKDPriv(ethereumHotAccount, 0 | HARDENED)
  const ethereumColdAccount = CKDPriv(ethereumPath, 1 | HARDENED)
  const ethereumColdWallet = CKDPriv(ethereumColdAccount, 0 | HARDENED)

  const bitcoinPath = CKDPriv(bip44path, 0 | HARDENED)
  const bitcoinHotAccount = CKDPriv(bitcoinPath, 0 | HARDENED)
  const bitcoinHotWallet = CKDPriv(bitcoinHotAccount, 0 | HARDENED)
  const bitcoinColdAccount = CKDPriv(bitcoinPath, 1 | HARDENED)
  const bitcoinColdWallet = CKDPriv(bitcoinColdAccount, 0 | HARDENED)

  const wallet = {}
  wallet.masterKey = { key: hexAndPad(I.slice(0, 32)), code: hexAndPad(I.slice(32)) }
  wallet.bip44Key = { key: hexAndPad(bip44path.key), code: hexAndPad(bip44path.code) }

  wallet.ethereumKey = { key: hexAndPad(ethereumPath.key), code: hexAndPad(ethereumPath.code) }
  wallet.ethereumHotAccount = { key: hexAndPad(ethereumHotAccount.key), code: hexAndPad(ethereumHotAccount.code) }
  wallet.ethereumHotKey = { key: hexAndPad(ethereumHotWallet.key), code: hexAndPad(ethereumHotWallet.code) }
  wallet.ethereumHotKeys = []
  wallet.ethereumColdAccount = { key: hexAndPad(ethereumColdAccount.key), code: hexAndPad(ethereumColdAccount.code) }
  wallet.ethereumColdKey = { key: Buffer.from(secp.publicKeyCreate(ethereumColdWallet.key, false)).toString('hex'), code: hexAndPad(ethereumColdWallet.code) }
  wallet.ethereumColdKeys = []

  wallet.bitcoinKey = { key: hexAndPad(bitcoinPath.key), code: hexAndPad(bitcoinPath.code) }
  wallet.bitcoinHotAccount = { key: hexAndPad(bitcoinHotAccount.key), code: hexAndPad(bitcoinHotAccount.code) }
  wallet.bitcoinHotKey = { key: hexAndPad(bitcoinHotWallet.key), code: hexAndPad(bitcoinHotWallet.code) }
  wallet.bitcoinHotKeys = []
  wallet.bitcoinColdAccount = { key: hexAndPad(bitcoinColdAccount.key), code: hexAndPad(bitcoinColdAccount.code) }
  wallet.bitcoinColdKey = { key: Buffer.from(secp.publicKeyCreate(bitcoinColdWallet.key, false)).toString('hex'), code: hexAndPad(bitcoinColdWallet.code) }
  wallet.bitcoinColdKeys = []

  return wallet
}

function ethPrivate(wallet, index) {
  return hexAndPad(CKDPriv({ key: Buffer.from(wallet.ethereumHotKey.key, 'hex'), code:  Buffer.from(wallet.ethereumHotKey.code, "hex") }, index | HARDENED).key);
}
function ethPublic(wallet, index) {
  return CKDPub({ key: wallet.ethereumColdKey.key, code:  Buffer.from(wallet.ethereumColdKey.code, "hex") }, index, false).key;
}

function btcPrivate(wallet, index) {
  return hexAndPad(CKDPriv({ key: Buffer.from(wallet.bitcoinHotKey.key, 'hex'), code:  Buffer.from(wallet.bitcoinHotKey.code, "hex") }, index | HARDENED).key);
}
function btcPublic(wallet, index) {
  return CKDPub({ key: wallet.bitcoinColdKey.key, code:  Buffer.from(wallet.bitcoinColdKey.code, "hex") }, index, true).key;
}

ipcMain.handle('set-wallet', async (event, password, dataType, path) => {
  try {
    if (dataType) {
      var data = fs.readFileSync('wallet.json', 'utf8');
      var wallet = JSON.parse(await decrypt(data, password));
      switch (dataType) {
        case "eth-hot":
          wallet.ethereumHotKeys.push(ethPrivate(wallet, wallet.ethereumHotKeys.length));
          break;

        case "eth-cold":
          wallet.ethereumColdKeys.push(ethPublic(wallet, wallet.ethereumColdKeys.length));
          break;

        case "btc-hot":
          wallet.bitcoinHotKeys.push(btcPrivate(wallet, wallet.bitcoinHotKeys.length));
          break;

        case "btc-cold":
          wallet.bitcoinColdKeys.push(btcPublic(wallet, wallet.bitcoinColdKeys.length));
          break;
      }
    }
    else {
      if (fs.existsSync(`${path}/coldwallet.json`)) {
        return false
      }
      var wallet = deriveFromSeed(randomBytes(32));
      fs.writeFileSync(`${path}/coldwallet.json`, await encrypt(JSON.stringify(wallet, null, 2), password), 'utf8');

      wallet.masterKey = null;
      wallet.bip44Key = null;
      wallet.ethereumKey = null;
      wallet.ethereumColdAccount = null;
      wallet.ethereumHotAccount = null;
      wallet.ethereumHotKeys.push(ethPrivate(wallet, 0));
      wallet.bitcoinKey = null;
      wallet.bitcoinColdAccount = null;
      wallet.bitcoinHotAccount = null;

      var bestblockhash = await bitcoin_fetch('getbestblockhash')
      var checkpoint = await bitcoin_fetch('getblock', [bestblockhash])
      fs.writeFileSync("btc_checkpoint.txt", checkpoint.height.toString())
    }
    fs.writeFileSync('wallet.json', await encrypt(JSON.stringify(wallet, null, 2), password), 'utf8');
  } catch (e) {
    console.error(e)
    return null
  }
})

ipcMain.handle("pick-file", async () => {
  return await pickFile()
});

async function pickFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"]
  });

  if (canceled) return null;
  return filePaths[0];
}

ipcMain.handle("pick-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"]
  });

  if (canceled) return null;
  return filePaths[0];
});

async function encrypt(data, password) {
  const salt = randomBytes(16);
  const key = await argon2.hash(password, { type: argon2.argon2id, salt, raw: true, memoryCost: 2**16, timeCost: 3, parallelism: 1 });

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, enc]).toString("base64");
}

async function decrypt(encB64, password) {
  const buf = Buffer.from(encB64, "base64");

  const salt = buf.subarray(0, 16);
  const iv   = buf.subarray(16, 28);
  const tag  = buf.subarray(28, 44);
  const data = buf.subarray(44);

  const key = await argon2.hash(password, { type: argon2.argon2id, salt, raw: true, memoryCost: 2**16, timeCost: 3, parallelism: 1 });

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let plain;
  try {
    plain = Buffer.concat([ decipher.update(data), decipher.final() ]);
  } catch {
    throw new Error("Bad password or corrupted wallet");
  }

  key.fill(0);
  buf.fill(0);

  return plain.toString("utf8");
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })
  win.loadFile(path.join(__dirname, 'dist/index.html'))
})
