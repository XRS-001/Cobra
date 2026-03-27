import React from 'react';
import { useNavigate } from "react-router-dom";
import './Sidebar.css';
import '../variables.css';
import BitcoinIcon from '../Images/BitcoinLogo.webp';
import EthereumIcon from '../Images/EthereumLogo.webp';
import DashboardIcon from '../Images/DashboardIcon.webp';

export default function Sidebar() {
  var navigate = useNavigate();
  return (
    <aside className="Sidebar">
      <h1>Cobra</h1>
      <button style={{ gap: '10px', paddingLeft: '36px' }}onClick={() => navigate("/home")}><span><img style={{ width: "1.25rem", paddingTop: '3px' }} src={DashboardIcon}/></span>Dashboard</button>
      <button onClick={() => navigate("/ethereum")}><span><img style={{ width: "2.75rem", paddingTop: '3px' }} src={EthereumIcon}/></span>Ethereum</button>
      <button onClick={() => navigate("/bitcoin")}><span><img style={{ width: "2.75rem", paddingTop: '3px' }} src={BitcoinIcon}/></span>Bitcoin</button>
    </aside>);
}
