import './Popup.css';
import React, { useState } from "react";
import ReactDOM, { createPortal }from 'react-dom';
import RefreshIcon from "../Images/RefreshIcon.png";

const Popup = ({ isOpen, onClose, children, isEth }) => {
  if (!isOpen) return null; // Don't render if not open

  return ReactDOM.createPortal(
    <div className="overlay">
      <div className={isEth ? "eth-modal" : "btc-modal"}>
        <button className="closeBtn" onClick={onClose}>X</button>
        {children}
      </div>
    </div>,
    document.getElementById("modal-root")
  );
};

export default Popup;

export function Alert({ message, onClose, cancel, data }) {
  return createPortal(
    <div className="overlay" style={{ minWidth: "200px", zIndex: "9999" }}>
      <div className="modal">
        <p>{message}</p>
        <pre style={{ fontSize: "1rem" }}><code>{data}</code></pre>
        <button className="closeAlert" onClick={() => onClose(true)}>OK</button>
        {cancel && <button className="closeAlert" onClick={() => onClose(false)}>Cancel</button>}
      </div>
    </div>,
    document.body
  );
}

export function useAlert() {
  const [alertState, setAlertState] = useState({ message: null, cancel: false, data: null, resolve: null });

  const showAlert = (message, cancel, data) => {
    return new Promise((resolve) => {
      setAlertState({ message, cancel, data, resolve });
    });
  };

  const AlertPopup = () =>
    alertState.message && (
      <Alert
        message={alertState.message}
        cancel = {alertState.cancel}
        data={alertState.data}
        onClose={(accepted) => {
          alertState.resolve(accepted);
          setAlertState({ message: null, cancel: false, data: null, resolve: null });
        }}
      />
    );
  return [showAlert, AlertPopup];
}
export function ApproveProposal ({ tx, onClose, web3 }) {
  console.log(tx)
  return (
    <div className="overlay" style={{ minWidth: "200px", zIndex: "9999" }}>
      <div className="approve-modal">
        <div className="Approve">
          <p>Approve Transaction</p>
          Receiver:
          <div className="ApproveProperty">{tx.to}</div>
          Amount:
          <div className="ApproveProperty">
            Ξ{web3.utils.fromWei(tx.value?.toString() ?? 0, "ether" )}
          </div>
          Gas cost:
          <div className="ApproveProperty">
            { parseInt(tx.gas ? tx.gas : tx.gasLimit).toLocaleString() }
          </div>
          Transaction fee:
          <div className="ApproveProperty">
            Ξ{web3.utils.fromWei((BigInt(tx.maxFeePerGas) * BigInt(tx.gas ? tx.gas : tx.gasLimit)).toString(), "ether" )}
          </div>
          <button className="closeAlert" onClick={() => onClose(true)}>Approve</button>
          <button className="closeAlert" onClick={() => onClose(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function useApprove() {
  const [approveState, setApproveState] = useState({ tx: null, web3: null, resolve: null });

  const showApprove = (tx, web3) => {
    return new Promise((resolve) => {
      setApproveState({ tx, web3, resolve });
    });
  };

  const ApprovePopup = () =>
    approveState.tx && (
      <ApproveProposal
        tx={approveState.tx}
        web3={approveState.web3}
        onClose={(approved) => {
          approveState.resolve(approved);
          setApproveState({ tx: null, web3: null, resolve: null });
        }}
      />
    );
  return [showApprove, ApprovePopup];
}

export function Refresh({ onRefresh }) {
  return (
    <span style={{ position: "relative", top: "23px" }}>
      <img src={RefreshIcon} className="Refresh" onClick={() => onRefresh()}/>
    </span>)
}
