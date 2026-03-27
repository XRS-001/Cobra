import React, { useEffect, useState, useRef } from 'react';
import Web3 from 'web3';
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));
const keccak256 = web3.utils.keccak256;
const toChecksumAddress = web3.utils.toChecksumAddress;
import WalletConnect from './WalletConnect.jsx'
import deepFreeze from 'deep-freeze';
import * as secp from "secp256k1";
import { Buffer } from "buffer";

function validAddress(addr) {
  if (!web3.utils.isAddress(addr)) return false
  return web3.utils.toChecksumAddress(addr) === addr
}
export function getEthereumAddress(publicKey) {
  return toChecksumAddress(keccak256(Buffer.from(publicKey, "hex").slice(1)).slice(-40))
}
async function getBalances(keys) {
  var balances = []
  for (var key of keys) {
    const bal = await web3.eth.getBalance(getEthereumAddress(key));
    balances.push({ balance: parseFloat(web3.utils.fromWei(bal, "ether")), key: key });
  }
  return balances
}
export async function mapBalances(password) {
  const data = await window.wallet.get("eth", password)
  const hotBalances = await getBalances(data.hotKeys);
  var hotBalance = 0;
  for (var bal in hotBalances) {
    hotBalance += hotBalances[bal].balance
  }
  const coldBalances = await getBalances(data.coldKeys);
  var coldBalance = 0;
  for (var bal in coldBalances) {
    coldBalance += coldBalances[bal].balance
  }

  const dAppKey = await window.wallet.get("dApp", password)
  var dapp_address = getEthereumAddress(dAppKey)
  const dAppBalance = web3.utils.fromWei(await web3.eth.getBalance(dapp_address), 'ether')
  return { hot: { balances: hotBalances, amount: hotBalance }, cold: { balances: coldBalances, amount: coldBalance }, dApp: dAppBalance }
}

import { QRCodeCanvas } from "qrcode.react";
import Sidebar from '../Home/Sidebar.jsx';
import Popup, { useAlert, useApprove, Refresh } from "../Popups/Popup";
import '../Wallet.css';
import '../variables.css';

export default function Ethereum({ password }) {
  var [refreshed, refresh] = useState()
  return (
    <div className="WalletWrapper">
      <Sidebar/>
      <div className="WalletContent">
        <div style={{ display: "flex", gap: "13px" }}>
          <h1>Ethereum Wallet</h1>
          <Refresh onRefresh={() => refresh(!refreshed)}/>
        </div>
        <Wallet password={password} refreshed={refreshed}/>
      </div>
    </div>);
}
function Wallet({ password, refreshed }) {
  var [showAlert, AlertPopup] = useAlert();
  var [showApprove, ApprovePopup] = useApprove();

  var [address, setAddress] = useState("");
  var [balance, setBalance] = useState({ hot: { balances: [], amount: 0 }, cold: { balances: [], amount: 0 }, dApp: 0 });
  var [update, updateBalance] = useState();

  var [sending, setSending] = useState(false);
  var [approve, setApprove] = useState(false);
  var [pendingTxs, setPendingTxs] = useState([]);
  const txsRef = useRef()

  var [moving, setMoving] = useState(false);
  var [pendingMoves, setPendingMoves] = useState([]);

  var [walletConnecting, setWalletConnecting] = useState(false);
  var [walletConnected, setWalletConnected] = useState(false);

  var [receiving, setReceiving] = useState(false);
  var [receivingToAddress, setReceivingToAddress] = useState(false);

  async function receiveToAddress(type) {
    switch (type) {
      case "hot":
        await window.wallet.set("eth-hot", password)
        var data = await window.wallet.get("eth", password)
        var lastKey = data.hotKeys[data.hotKeys.length - 1]
        return getEthereumAddress(lastKey);

      case "cold":
        await window.wallet.set("eth-cold", password)
        var data = await window.wallet.get("eth", password)
        var lastKey = data.coldKeys[data.coldKeys.length - 1]
        return getEthereumAddress(lastKey);

      case "dApp":
        return getEthereumAddress(await window.wallet.get("dApp", password))
    }
  }

  useEffect(() => {
    mapBalances(password).then(balance => {
      setBalance(balance)
    })
  }, [update, refreshed])
  useEffect(() => {
    txsRef.current = deepFreeze(pendingTxs)
    if (moving) {
      setMoving(false)
      setApprove(true)
    }
    else if (sending) {
      setSending(false)
      setApprove(true)
    }
  }, [pendingTxs])
  return (
    <div className="EthereumWallet">
      <div className="WalletFeatures">
        Balance: <br/>
        <div className="Balance"> <span style={{whiteSpace:"pre"}}>Hot | Cold | dApp<br/>{`Ξ${balance.hot.amount ? balance.hot.amount.toFixed(5) : 0} | Ξ${balance.cold.amount ? balance.cold.amount.toFixed(5) : 0} | Ξ${balance.dApp ? parseFloat(balance.dApp).toFixed(5) : 0}`}</span></div>
        <div className="WalletFunctions">
          <button className="WalletProperty" disabled={walletConnected} onClick={(event) => {
            event.preventDefault()
            setWalletConnecting(true)
          }}>Connect to dApp</button>
          <button className="WalletProperty" onClick={(event) => {
            event.preventDefault()
            setSending(true)
          }}>Send</button>
          <button className="WalletProperty" onClick={(event) => {
            event.preventDefault()
            setMoving(true)
          }}>Move</button>
          <button className="WalletProperty" onClick={(event) => {
            event.preventDefault()
            setReceiving(true)
          }}>Receive</button>
        </div>
      </div>
      <Popup isOpen={walletConnecting} onClose={() => setWalletConnecting(false)} isEth={true}>
        { walletConnecting && <WalletConnect web3={web3} alert={showAlert} approve={showApprove} password={password} onConnect={(message) => {
          setWalletConnecting(false)
          if (typeof(message) != "string") {
            setWalletConnected(true)
            showAlert(message)
          }
          else {
            showAlert("Connection successful.")
          }
        }} onDisconnect={() => {
          setWalletConnected(false)
        }}/> }
      </Popup>
      <Popup isOpen={sending} onClose={() => setSending(false)} isEth={true}>
        <Send password={password} balances={balance} onSend={(tx) => {
          if (tx) {
            if (typeof(tx) == "string") {
              showAlert(tx)
              setSending(false)
            }
            else {
              setPendingTxs([tx])
            }
          }
        }}/>
      </Popup>
      <Popup isOpen={moving} onClose={() => setMoving(false)} isEth={true}>
        <Move balances={balance} move={async (type, amount) => {
          var txs = []
          if (!type) {
            setMoving(false)
          }
          else if (type == "A" || type == "B") {
            await window.wallet.set("eth-hot", password)
            var keys = await window.wallet.get("eth", password)
            const to = getEthereumAddress(keys.hotKeys[keys.hotKeys.length - 1])
            if (type == "A") {
              var spenders = await getSpenders(balance.hot.balances, amount, to, true)
              if (typeof(spenders) == "string") {
                showAlert(spenders)
                setMoving(false)
                return
              }
              txs = await window.wallet.constructTxs(spenders, password)
            }
            else {
              var spenders = await getSpenders(balance.cold.balances, amount, to, true)
              if (typeof(spenders) == "string") {
                showAlert(spenders)
                setMoving(false)
                return
              }
              await showAlert("It's recommended to turn your device offline before signing with cold-wallet keys. Click ok when you've disconnected from the internet.")
              txs = await window.wallet.constructTxs(spenders, password, true)
            }
            if (typeof(txs) == "string") {
              showAlert(txs)
              setMoving(false)
              return
            }
            setPendingTxs(txs)
          }
          else if (type == "C"){
            await window.wallet.set("eth-cold", password)
            var keys = await window.wallet.get("eth", password)
            const to = getEthereumAddress(keys.coldKeys[keys.coldKeys.length - 1])
            var spenders = await getSpenders(balance.hot.balances, amount, to, true)
            if (typeof(spenders) == "string") {
              showAlert(spenders)
              setMoving(false)
              return
            }
            txs = await window.wallet.constructTxs(spenders, password)
            if (typeof(txs) == "string") {
              showAlert(txs)
              setMoving(false)
              return
            }
            setPendingTxs(txs)
          }
          else if (type == "D") {
            var dAppAccount = await window.wallet.get("dApp", password)
            const to = getEthereumAddress(dAppAccount)
            var spenders = await getSpenders(balance.hot.balances, amount, to, true)
            if (typeof(spenders) == "string") {
              showAlert(spenders)
              setMoving(false)
              return
            }
            txs = await window.wallet.constructTxs(spenders, password)
            if (typeof(txs) == "string") {
              showAlert(txs)
              setMoving(false)
              return
            }
            setPendingTxs(txs)
          }
          else {
            showAlert(type)
            setMoving(false)
          }
        }}/>
      </Popup>
      <Popup isOpen={receiving} onClose={() => setReceiving(false)} isEth={true}>
        Receive type
        <button onClick={async (event) => {
          event.preventDefault()
          var address = await receiveToAddress("cold")
          setAddress(address)
          setReceivingToAddress(true)
          setReceiving(false)
        }}>Cold wallet</button>
        <button onClick={async (event) => {
          event.preventDefault()
          var address = await receiveToAddress("hot")
          setAddress(address)
          setReceivingToAddress(true)
          setReceiving(false)
        }}>Hot wallet</button>
        <button onClick={async (event) => {
          event.preventDefault()
          var address = await receiveToAddress("dApp")
          setAddress(address)
          setReceivingToAddress(true)
          setReceiving(false)
        }}>dApp account</button>
      </Popup>
      <Popup isOpen={receivingToAddress} onClose={() => setReceivingToAddress(false)} isEth={true}>
        { receivingToAddress && <Receive address={address}/> }
      </Popup>
      <Popup isOpen={approve} onClose={() => setApprove(false)} isEth={true}>
        { approve && <Approve txs={txsRef} approve={(signed) => {
          if (typeof(signed) == "string") {
            showAlert(signed)
          }
          else {
            for (var tx of signed) {
              web3.eth.sendSignedTransaction(tx.rawTransaction).then(receipt => updateBalance(!update)).catch(error => showAlert(error));
            }
          }
          setApprove(false)
        }}/> }
      </Popup>
      <AlertPopup/>
      <ApprovePopup/>
    </div>)
}
function Receive({ address }) {
  return (
    <>
      <p>Receive ether</p>
      <p>{address}</p>
      <div>
        <QRCodeCanvas value={address} size={200} />
      </div>
    </>)
}
function Send({ balances, onSend, password }) {
  var [receiver, setReceiver] = useState("");
  var [amount, setAmount] = useState(0);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      if (!validAddress(receiver)) {
        onSend("Invalid address")
      }
      else if (balances.hot.amount < amount) {
        onSend("Not enough funds")
      }
      else {
        var spenders = await getSpenders(balances.hot.balances, amount, receiver, false)
        if (typeof(spenders) == "string") {
          onSend(spenders)
        }
        else {
          console.log("check3")
          var tx = await window.wallet.constructTxs(spenders, password)
          console.log("check4")
          if (typeof(tx) == "string") {
            onSend(tx)
          }
          else {
            onSend(tx[0])
          }
        }
      }
      setReceiver("")
      setAmount(0)
    }}>
      <div className="Send">
        <p>Send ether</p>
        Receiver: <input className="SendInput" name="Receiver" placeholder="0x..." required length="42" type="text" onChange={(e) => setReceiver(e.target.value)}/>
        Amount: <input className="SendInput" name="Amount" value={amount} type="text" onChange={(e) => { if (/^-?\d*(\.\d*)?$/.test(e.target.value)) setAmount(e.target.value)}}/>
        <button className="SendInput" type="submit">Submit</button>
      </div>
    </form>)
}
async function getSpenders(balances, amount, receiver, allowMultiple) {
  amount = BigInt(web3.utils.toWei(amount, "ether"))
  var spenders = []

  const block = await web3.eth.getBlock("pending");
  const baseFee = BigInt(block.baseFeePerGas);
  const tip = baseFee / 5n;

  var maxPriority = tip.toString();
  var maxFee = (baseFee * 2n + tip).toString();
  const gasFee = BigInt(maxFee) * BigInt(21_000);

  if (allowMultiple) {
    var current = BigInt("0")
    for (var i = 0; i < balances.length; i++) {
      var spender = { ...balances[i], balance: BigInt(web3.utils.toWei(balances[i].balance, "ether")) }
      const address = getEthereumAddress(spender.key)
      const nonce = await web3.eth.getTransactionCount(address, "pending");
      if (spender.balance - gasFee + current >= amount) {
        spenders.push({ address: address, key: spender.key, spend: amount - current, nonce: nonce, index: i })
        current += amount - current
        break
      }
      else if (spender.balance > gasFee) {
        spenders.push({ address: getEthereumAddress(spender.key), key: spender.key, spend: spender.balance - gasFee, index: i })
        current += spender.balance - gasFee
      }
    }
    if (current < amount) {
      return "Insufficient combined balance after gas.";
    }
  }
  else {
    var found = false
    for (var i = 0; i < balances.length; i++) {
      if (BigInt(web3.utils.toWei(balances[i].balance, "ether")) >= amount + gasFee) {
        const address = getEthereumAddress(balances[i].key)
        const nonce = await web3.eth.getTransactionCount(address, "pending");
        var spenders = [{ address: address, key: balances[i].key, spend: amount, balance: balances[i].balance, nonce: nonce, index: i }]
        found = true
        break
      }
    }
    if (!found) return "No single account has sufficient balance. Rebalance wallet to continue."
  }

  return { spenders: spenders, receiver: receiver, maxPriority: maxPriority, maxFee: maxFee }
}
function Move({ balances, move }) {
  const [choice, setChoice] = useState("");
  var [amount, setAmount] = useState(0);

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (amount == 0) {
        move("Amount must be greater than zero.")
      }
      else if (choice == "A" || choice == "C" || choice == "D") {
        if (balances.hot.amount < amount) {
          move("Move amount greater than available balance.")
        }
        else {
          move(choice, amount)
        }
      }
      else if (balances.cold.amount >= amount) {
        move(choice, amount)
      }
      else {
        move("Move amount greater than available balance.")
      }
    }}>
      <div className="Move">
        <p>Move ether</p>
        Amount:
        <input className="MoveInput" name="Amount" value={amount} type="text" onChange={(e) => {
          if (/^-?\d*(\.\d*)?$/.test(e.target.value)) {
            setAmount(e.target.value)
          }
        }}/>
        <button className="MoveInput" type="submit" onClick={() => setChoice("A")}>Reorganize Hot Wallet</button>
        <button className="MoveInput" type="submit" onClick={() => setChoice("B")}>Transfer to Hot Wallet</button>
        <button className="MoveInput" type="submit" onClick={() => setChoice("C")}>Transfer to Cold Wallet</button>
        <button className="MoveInput" type="submit" onClick={() => setChoice("D")}>Transfer to dApp Wallet</button>
      </div>
    </form>)
}
function Approve({ txs, approve }) {
  txs = txs.current
  if (txs.length == 0) return
  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      var signedTxs = []
      for (var tx of txs) {
        try {
          await web3.eth.call(tx.tx)
        } catch (err) {
          approve(err.message)
          return
        }
        signedTxs.push(tx.signed);
      }
      approve(signedTxs)
      return
    }}>
      <div className="Approve">
        <p>Approve Transaction{txs.length > 1 ? "s" : null}</p>
        Receiver:
        <div className="ApproveProperty">{txs[0].tx.to}</div>
        Amount:
        <div className="ApproveProperty">
          Ξ{web3.utils.fromWei(txs.reduce((acc, item) => acc + BigInt(item.tx.value), BigInt(0)).toString(), "ether" )}
        </div>
        Gas cost:
        <div className="ApproveProperty">
          { txs.reduce((acc, item) => acc + BigInt(item.tx.gas), BigInt(0)).toLocaleString() }
        </div>
        Transaction fee:
        <div className="ApproveProperty">
          Ξ{web3.utils.fromWei(txs.reduce((acc, item) => acc + BigInt(item.tx.maxFeePerGas) * BigInt(item.tx.gas), BigInt(0)).toString(), "ether" )}
        </div>
        <button className="SendInput" type="submit">Approve</button>
      </div>
    </form>)
}
