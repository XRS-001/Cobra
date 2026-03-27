import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Home/Sidebar.jsx';
import './Start.css';
import '../variables.css';

export default function Start({ cachePassword }) {
  var navigate = useNavigate();
  var [password, setPassword] = useState('');
  var [path, setPath] = useState('');
  var [checkWallet, setChecked] = useState(undefined);
  var [error, setError] = useState('');
  async function check() {
    var checked = await window.wallet.get("", "");
    return checked
  }
  useEffect(() => {
    async function initialCheck() {
      var checked = await check();
      setChecked(checked);
    }
    initialCheck();
  }, [])
  if (checkWallet === undefined) {
    return <div></div>
  }
  return (
    <div className="Start">
      <div className="StartContent">
        {
          checkWallet ? <h1>Enter password</h1> : <h1>Initialize a master key with password</h1>
        }
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (!checkWallet) {
            window.electronAPI.pickFolder().then(folder => {
              if (!folder) {
                return
              }
              createWallet(password, folder)
              decryptWallet(password);
              cachePassword(password);
              navigate('/home');
            });
          }
          else {
            const success = await decryptWallet(password);
            if (!success) {
              setPassword("");
              setError(true)
              return
            }
            cachePassword(password);
            navigate('/home');
          }
        }
        }>
          {error && <p style={{ color: 'red', fontWeight: 'bold' }}>Incorrect password</p>}
          <input className="TextInput" type="password" placeholder='satoshi041975' value={password} required minLength="10" maxLength="50" onChange={e => setPassword(e.target.value)}/>
          <div>
            <input className="SubmitButton" type='submit' value={checkWallet ? "Unlock Wallet" : "Generate Seed"}/>
          </div>
        </form>
      </div>
    </div>);
}
function createWallet(password, path){
  window.wallet.set("", password, path);
}
async function decryptWallet(password){
  var data = await window.wallet.get("", password)
  return data;
}
