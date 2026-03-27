import React, { useEffect, useState, useRef } from 'react';
import { QRCodeCanvas } from "qrcode.react";
import Sidebar from '../Home/Sidebar.jsx';
import Popup, { useAlert, Refresh } from "../Popups/Popup";
import '../Wallet.css';
import '../variables.css';
import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import * as secp from "secp256k1";

const network = bitcoin.networks.bitcoin;
function getAddress(pubKey) {
  const { address } = bitcoin.payments.p2wpkh({ pubkey: typeof(pubKey) == "string" ? Buffer.from(pubKey, 'hex') : pubKey, network, });
  return address
}
export async function mapBalances(password, nonce) {
  const data = await window.wallet.get("btc", password)
  const utxos = await window.bitcoinAPI.getBalances(data.hotKeys?.map(key => getAddress(key)) ?? [], data.coldKeys?.map(key => getAddress(key)) ?? [], password, nonce);
  if (!utxos) {
    return { hot: { utxos: [], amount: 0 }, cold: { utxos: [], amount: 0 }}
  }
  const hotBalance = utxos.hot.reduce((sum, utxo) => { return sum + utxo.value }, 0) * 100_000_000
  const coldBalance = utxos.cold.reduce((sum, utxo) => { return sum + utxo.value }, 0) * 100_000_000
  return { hot: { utxos: utxos.hot, amount: hotBalance }, cold: { utxos: utxos.cold, amount: coldBalance }}
}

export default function Bitcoin({ password }) {
  var [refreshed, refresh] = useState(false)
  return (
    <div className="WalletWrapper">
      <Sidebar/>
      <div className="WalletContent">
        <div style={{ display: "flex", gap: "13px" }}>
          <h1>Bitcoin Wallet</h1>
          <Refresh onRefresh={() => refresh(!refreshed)}/>
        </div>
        <Wallet password={password} refreshed={refreshed}/>
      </div>
    </div>);
}

function Wallet({ password, refreshed }) {
  var [showAlert, AlertPopup] = useAlert();

  var [address, setAddress] = useState("");
  var [balance, setBalance] = useState({ hot: { utxos: [], amount: 0 }, cold: { utxos: [], amount: 0 } });
  var [syncStatus, setSyncStatus] = useState(0);

  var [sending, setSending] = useState(false);
  var [sendingOptions, setSendingOptions] = useState(false);
  var [sendingCold, setSendingCold] = useState(false);

  var [approve, setApprove] = useState(false);
  var [pendingTx, setPendingTx] = useState();
  const txsRef = useRef()

  var [receiving, setReceiving] = useState(false);
  var [receivingToAddress, setReceivingToAddress] = useState(false);

  useEffect(() => {
    var nonce = Date.now();
    mapBalances(password, nonce).then((balances) => {
      setBalance(balances)
    })
    window.bitcoinAPI.onStatusUpdate((status, _nonce) => {
      if (nonce == _nonce) setSyncStatus(status)
    });
  }, [refreshed])

  useEffect(() => {
    txsRef.current = pendingTx
    if (sending) {
      setSending(false)
      setApprove(true)
    }
  }, [pendingTx])
  return (
    <div className="BitcoinWallet">
      <div className="WalletFeatures">
        Balance: <br/>
        <div className="Balance">
          {balance.hot.amount ? <span style={{whiteSpace:"pre"}}>Hot | Cold<br/>{`${balance.hot.amount.toLocaleString()} sats | ${balance.cold.amount.toLocaleString()} sats`}</span> : `Syncing: ${parseInt(syncStatus)}%`}
        </div>
        <div className="WalletFunctions">
          <button className="WalletProperty" onClick={(event) => {
            event.preventDefault()
            setSendingOptions(true)
          }}>Send</button>
          <button className="WalletProperty" onClick={(event) => {
            event.preventDefault()
            setReceiving(true)
          }}>Receive</button>
        </div>
      </div>
      <Popup isOpen={sendingOptions} onClose={() => setSendingOptions(false)} isEth={false}>
        Send from cold wallet?
        <button onClick={(cold) => {
          setSendingCold(true)
          setSendingOptions(false)
          setSending(true)
        }}>Yes</button>
        <button onClick={(cold) => {
          setSendingCold(false)
          setSendingOptions(false)
          setSending(true)
        }}>No</button>
      </Popup>
      <Popup isOpen={sending} onClose={() => setSending(false)} isEth={false}>
        <Send password={password} sendingCold={sendingCold} balances={sendingCold ? balance.cold : balance.hot} onSend={async (tx) => {
          if (tx) {
            if (typeof(tx) == "string") {
              showAlert(tx)
              setSending(false)
            }
            else {
              if (sendingCold) await showAlert("It's recommended to turn your device offline before signing with cold-wallet keys. Click ok when you've disconnected from the internet.")
              try {
                var signedTx = await window.bitcoinAPI.signTx(tx.psbt, tx.signers, password, sendingCold)
                if (signedTx.error) {
                  showAlert(signedTx)
                  setSending(false)
                }
                else {
                  setPendingTx({ signed: signedTx, raw: tx })
                }
              }
              catch (err) {
                showAlert(err.message)
              }
            }
          }
        }}/>
      </Popup>
      <Popup isOpen={receiving} onClose={() => setReceiving(false)} isEth={false}>
        Receive to cold wallet?
        <button onClick={(event) => {
          event.preventDefault()
          window.wallet.set("btc-cold", password).then(() => {
            window.wallet.get("btc", password).then((data) => {
              const lastKey = data.coldKeys[data.coldKeys.length - 1];
              const address = getAddress(lastKey);
              setAddress(address)
              setReceivingToAddress(true)
              setReceiving(false)
            });
          });
        }}>Yes</button>
        <button onClick={(event) => {
          event.preventDefault()
          window.wallet.set("btc-hot", password).then(() => {
            window.wallet.get("btc", password).then((data) => {
              const lastKey = data.hotKeys[data.hotKeys.length - 1]
              const address = getAddress(lastKey);
              setAddress(address)
              setReceivingToAddress(true)
              setReceiving(false)
            });
          });
        }}>No</button>
      </Popup>
      <Popup isOpen={receivingToAddress} onClose={() => setReceivingToAddress(false)} isEth={false}>
        { receivingToAddress && <Receive address={address}/> }
      </Popup>
      <Popup isOpen={approve} onClose={() => setApprove(false)} isEth={false}>
        { approve && <Approve tx={txsRef} password={password} approve={async (message) => {
          if (message) {
            showAlert(message)
          }
          setApprove(false)
        }}/> }
      </Popup>
      <AlertPopup/>
    </div>)
}
function Receive({ address }) {
  return (
    <>
      <p>Receive bitcoin</p>
      <p>{address}</p>
      <div>
        <QRCodeCanvas value={address} size={200} />
      </div>
    </>)
}
function Send({ balances, onSend, password, sendingCold }) {
  var [receiver, setReceiver] = useState("");
  var [amount, setAmount] = useState(0);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      try {
        bitcoin.address.toOutputScript(receiver, bitcoin.networks.bitcoin)
      }
      catch {
        onSend("Invalid address.")
        return
      }
      if (!sendingCold) {
        if (amount > balances.amount) {
          onSend("Not enough funds")
          return
        }
        else {
          await window.wallet.set("btc-hot", password)
          var data = await window.wallet.get("btc", password)
          const lastKey = data.hotKeys[data.hotKeys.length - 1]
          const change = getAddress(lastKey);
          var tx = await getTx(parseInt(amount), receiver, change, balances.utxos)
          onSend(tx)
        }
      }
      else {
        if (amount > balances.amount) {
          onSend("Not enough funds")
        }
        else {
          await window.wallet.set("btc-cold", password)
          var data = await window.wallet.get("btc", password)
          const lastKey = data.coldKeys[data.coldKeys.length - 1]
          const change = getAddress(lastKey);
          var tx = await getTx(parseInt(amount), receiver, change, balances.utxos)
          if (typeof(tx) == "string") {
            onSend(tx)
          }
          else {
            onSend(tx)
          }
        }
      }
    }}>
      <div className="Send">
        <p>Send bitcoin</p>
        Receiver: <input className="SendInput" name="Receiver" placeholder="0x..." required length="42" type="text" onChange={(e) => setReceiver(e.target.value)}/>
        Amount: <input className="SendInput" name="Amount" value={amount} type="text" onChange={(e) => { if (/^-?\d*$/.test(e.target.value)) setAmount(e.target.value)}}/>
        <button className="SendInput" type="submit">Submit</button>
      </div>
    </form>)
}
async function getTx(amount, receiver, change, utxos) {
  try {
    const feerate = await window.bitcoinAPI.getFeerate()
    var inputs = []
    var currentAmount = 0
    var canInitiate = false
    for (var utxo of utxos) {
      inputs.push({ utxo: utxo, signer: utxo.scriptPubKey.address })
      currentAmount += utxo.value * 100_000_000
      var total_vbytes = 55 + 57 * (inputs.length + 1)
      if (currentAmount >= total_vbytes * feerate + amount) {
        canInitiate = true
        break;
      }
    }
    if (!canInitiate) {
      return "Not enough funds for amount and fee."
    }
    const psbt = new bitcoin.Psbt();
    for (var input of inputs) {
      psbt.addInput({
        hash: input.utxo.hash,
        index: input.utxo.n,
        witnessUtxo: {
          script: Uint8Array.from(Buffer.from(input.utxo.scriptPubKey.hex, 'hex')),
          value: BigInt(Math.round(input.utxo.value * 100_000_000))
        }
      })
    }
    psbt.addOutput({ address: receiver, value: BigInt(amount), });
    if (BigInt(parseInt(currentAmount - (amount + total_vbytes * feerate))) > 0) {
      const value = Math.max(300, parseInt(currentAmount - (amount + total_vbytes * feerate)))
      psbt.addOutput({ address: change, value: BigInt(value) });
    }
    return { psbt: psbt.toBase64(), signers: inputs.map(input => input.signer ), receiver: receiver, amount: amount, fee: total_vbytes * feerate }
  }
  catch (err) {
    return err.message
  }
}
function Approve({ tx, approve }) {
  tx = tx.current
  if (!tx) return
  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      try {
        var sent = await window.bitcoinAPI.sendTx(tx.signed)
        if (sent.error) {
          approve(sent.message)
        }
      }
      catch (err) {
        approve(err.message)
      }
      approve()
    }}>
      <div className="Approve">
        <p>Approve Transaction</p>
        Receiver:
        <div className="ApproveProperty">{tx.raw.receiver}</div>
        Amount:
        <div className="ApproveProperty">{tx.raw.amount.toLocaleString()} sats</div>
        Transaction fee:
        <div className="ApproveProperty">{tx.raw.fee.toLocaleString()} sats</div>
        <button className="SendInput" type="submit">Approve</button>
      </div>
    </form>)
}
