import React, { useEffect, useRef, useState } from "react";
import SignClient from "@walletconnect/sign-client";
import { getEthereumAddress } from "./Ethereum.jsx";

export default function WalletConnect({ onConnect, onDisconnect, password, approve, alert, web3 }) {
  const clientRef = useRef(null);
  const addressRef = useRef(null);
  const [status, setStatus] = useState("Enter WalletConnect URI: ");
  const [uri, setUri] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const key = await window.wallet.get("dApp", password);
        const address = getEthereumAddress(key);
        addressRef.current = address;

        const wc = await SignClient.init({
          projectId: "1ddcba80668ba4aad86e7c75e8eb5292",
          metadata: {
            name: "My Wallet",
            description: "Custom WalletConnect v2 Wallet",
            url: "http://localhost",
            icons: []
          }
        });

        if (!alive) return;
        clientRef.current = wc;

        wc.on("session_proposal", onProposal);
        wc.on("session_request", onRequest);
        wc.on("session_delete", () => setStatus("Disconnected by dApp"));
      } catch (e) {
        setStatus(`Error initializing wallet: ${e.message}`);
      }
    })();

    return () => {
      alive = false;
      if (clientRef.current) clientRef.current.removeAllListeners();
    };
  }, []);

  // Handle incoming session proposals from dApps
  const onProposal = async ({ id, params }) => {
    const ethAddress = `eip155:1:${addressRef.current}`;
    const optimismAddress = `eip155:10:${addressRef.current}`; // Optimism

    const namespaces = {
      eip155: {
        accounts: [ethAddress, optimismAddress],
        methods: [
          "eth_sendTransaction",
          "personal_sign",
          "eth_signTypedData_v4",
          "eth_chainId",
          "eth_accounts",
          "eth_call",
          "wallet_switchEthereumChain",   // chain switching
          "wallet_addEthereumChain"       // add custom chain
        ],
        events: ["accountsChanged", "chainChanged"]
      }
    };

    await clientRef.current.approve({ id, namespaces });
    setStatus("Connected to dApp ✅");
  };

  // Handle session requests
  const onRequest = async ({ topic, params, id }) => {
    const { request } = params;
    const wc = clientRef.current;

    try {
      if (request.method === "eth_sendTransaction") {
        const tx = request.params[0];
        if (!(await approve(tx, web3))) return reject(wc, topic, id);
        const signed = await window.wallet.signForDapp("send", tx, password);
        const receipt = await web3.eth.sendSignedTransaction(signed);
        return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: receipt.transactionHash } });
      }

      if (request.method === "personal_sign") {
        const msg = request.params[0] || request.params[1];
        if (!(await alert("Approve signing?", true, msg))) return reject(wc, topic, id);
        const sig = await window.wallet.signForDapp("sign", msg, password);
        return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: sig } });
      }

      if (request.method === "eth_chainId") {
        // Return chainId depending on requested chain
        const chainId = request.params?.[0];
        if (chainId === "0xa") return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: "0xa" } }); // Optimism
        return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: "0x1" } }); // Ethereum
      }

      if (request.method === "eth_accounts") {
        return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: [addressRef.current] } });
      }

      if (request.method === "wallet_switchEthereumChain") {
        const chainId = request.params[0]?.chainId;
        if (!chainId) return reject(wc, topic, id, "No chainId provided");

        // You can optionally set web3 provider RPC dynamically here
        setStatus(`Switching to chain ${parseInt(chainId, 16)}...`);
        return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: null } });
      }

      if (request.method === "wallet_addEthereumChain") {
        const chain = request.params[0];
        // Here you could add logic to store custom chain info or update provider
        setStatus(`Adding chain ${chain.chainName} (${chain.chainId})`);
        return wc.respond({ topic, response: { id, jsonrpc: "2.0", result: null } });
      }

      return wc.respond({
        topic,
        response: { id, jsonrpc: "2.0", error: { code: 5001, message: "Unsupported method" } }
      });
    } catch (e) {
      return wc.respond({
        topic,
        response: { id, jsonrpc: "2.0", error: { code: 5000, message: e.message } }
      });
    }
  };

  // Handle URI submission
  const handleURI = async (e) => {
    e.preventDefault();
    if (!uri || !clientRef.current) return;

    try {
      await clientRef.current.core.pairing.pair({ uri });
      setStatus("Pairing request sent, waiting for dApp...");
      setUri("");
      onConnect("Connection successful");
    } catch (e) {
      setStatus(`Failed to pair: ${e.message}`);
      onDisconnect();
    }
  };

  return (
    <div>
      <form onSubmit={(e) => handleURI(e)}>
        <div className="Send">
          <p>{status}</p>
          <input
            className="SendInput"
            type="text"
            placeholder="wc:..."
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            required
          />
          <button className="SendInput" type="submit">Connect</button>
        </div>
      </form>
    </div>
  );
}

// Reject helper
async function reject(wc, topic, id, message = "User rejected") {
  await wc.respond({
    topic,
    response: { id, jsonrpc: "2.0", error: { code: 4001, message } }
  });
}
