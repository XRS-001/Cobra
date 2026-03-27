import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import './App.css';
import '../variables.css';
import Start from '../Start/Start.jsx';
import Home from './Home.jsx';
import Ethereum from '../Ethereum/Ethereum.jsx';
import Bitcoin from '../Bitcoin/Bitcoin.jsx';

export default function App() {
  var [savedPassword, savePassword] = useState("");
  return (
    <Router>
      <div className="main">
        <Routes>
          <Route path="/" element={<Start cachePassword={savePassword}/>} />
          <Route path="/home" element={<Home password={savedPassword} />} />
          <Route path="/ethereum" element={<Ethereum password={savedPassword} />} />
          <Route path="/bitcoin" element={<Bitcoin password={savedPassword} />} />
        </Routes>
      </div>
    </Router>)
}
