import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import './Home.css';
import '../variables.css';
import { mapBalances as mapEthereumBalances } from '../Ethereum/Ethereum.jsx'
import { mapBalances as mapBitcoinBalances } from '../Bitcoin/Bitcoin.jsx'

export default function Home({ password }) {
  var [ethereumBalance, setEthereumBalance] = useState(0)
  var [bitcoinBalance, setBitcoinBalance] = useState(0)
  var navigate = useNavigate()
  useEffect(() => {
    mapEthereumBalances(password).then(balance => {
      setEthereumBalance(balance.hot.amount + balance.cold.amount + balance.dApp)
    })
    mapBitcoinBalances(password).then(balance => {
      setBitcoinBalance(balance.hot.amount + balance.cold.amount)
    })
  })
  return (
    <div className="Home">
      <Sidebar/>
      <div className="HomeContent">
        <div><h1>Cobra Dashboard</h1></div>
        <div className="HomeWallets">
          <div className="HomeWallet">
            <h1>Ethereum Wallet</h1>
            <div className="HomeWalletProperty">Balance: Ξ{parseFloat(ethereumBalance).toFixed(5)}</div>
            <button className="HomeWalletProperty" onClick={() => navigate('/ethereum')}>Send</button>
          </div>
          <div className="HomeWallet">
            <h1>Bitcoin Wallet</h1>
            <div className="HomeWalletProperty">Balance: ₿{parseFloat(bitcoinBalance / 100_000_000).toFixed(8)}</div>
            <button className="HomeWalletProperty" onClick={() => navigate('/bitcoin') }>Send</button>
          </div>
        </div>
      </div>
    </div>);
}
