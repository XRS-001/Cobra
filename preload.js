const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wallet', {
  get: (dataType, password, coldWallet) => ipcRenderer.invoke('get-wallet', password, dataType, coldWallet),
  set: (dataType, password, path) => ipcRenderer.invoke('set-wallet', password, dataType, path),
  constructTxs: (spendParams, password, coldSpend) => ipcRenderer.invoke('construct-txs', spendParams, password, coldSpend),
  signForDapp: (signer, payload, password) => ipcRenderer.invoke('sign-for-dapp', signer, payload, password)
})

contextBridge.exposeInMainWorld("electronAPI", {
  pickFile: () => ipcRenderer.invoke("pick-file"),
  pickFolder: () => ipcRenderer.invoke("pick-folder")
});

contextBridge.exposeInMainWorld('bitcoinAPI', {
  getBalances: (hotAddresses, coldAddresses, password, nonce) => ipcRenderer.invoke('btc-balances', hotAddresses, coldAddresses, password, nonce),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, status, nonce) => callback(status, nonce)),
  getFeerate: () => ipcRenderer.invoke('get-feerate'),
  signTx: (tx, signers, password, coldSpend) => ipcRenderer.invoke('sign-tx', tx, signers, password, coldSpend),
  sendTx: (tx) => ipcRenderer.invoke('send-tx', tx)
})
