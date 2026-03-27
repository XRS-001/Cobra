# Cobra Wallet
### Welcome
Cobra is a Bitcoin/Ethereum dual wallet build in Electron and React. It uses locally running Bitcoin and Ethereum nodes for trustless RPC access and a BIP32 HD online/offline wallet structure that's encrypted on disk.
### Running Cobra
To run Cobra, change directory to Cobra root folder and run these commands (npm must be installed):
```
npm init
npm run start
```
I haven't added support for compiling to a production executable yet.
### Key Management
I decided to go with a dual-wallet structure for key management. Basically the Bitcoin and Ethereum wallet have two accounts each: hot and cold. The hot account is used to derive hardened private keys using an extended private key, while the cold account is used to derive unhardened public keys using an extended public key. Only these extended keys are stored on disk and the complete version is offloaded to a cold wallet path you select on startup. The idea is that you can store the wallet file used to derive cold private keys on an offline USB/hardware wallet, but maintain the ability to receive funds to the cold key addresses in the online wallet. Both wallet files are encrypted with a password chosen on initial startup.

The derivation path looks like this:
```plaintext
32 random bytes ⮕ master key

master key
└─ '44
   ├─ '0 (Bitcoin wallet)
   │   │
   │   ├─ '0 (Bitcoin hot wallet)
   │   │   └─ '0 (Bitcoin hot account) 
   │   │       └─  Bitcoin hot hardened private keys
   │   │   
   │   └─ '1 (Bitcoin cold wallet)
   │       └─ '0 (Bitcoin cold account)
   │           └─ Biitcoin cold unhardend public keys
   │
   └─ '60 (Ethereum wallet)
       │
       ├─ '0 (Ethereum hot wallet)
       │   └─ '0 (Ethereum hot account)
       │       └─  Ethereum hot hardened private keys
       │   
       └─ '1 (Ethereum cold wallet)
           └─ '0 (Ethereum cold account)
               └─ Ethereum cold unhardend public keys

```
When spending funds, there are options to select the cold wallet file to sign transactions from the cold keys. This signing happens offline.

---
### Start Screen
The start screen is a simple prompt to enter a password. On the first startup the HD wallet is generated with 32 random bytes, and the user is prompted to select a directrory to create the cold walelt (preferably a USB stick or hardware wallet). The password is used to encrypt both the hot and cold wallet.

<img width="3303" height="2093" alt="Screenshot from 2026-02-10 10-10-33" src="https://github.com/user-attachments/assets/03a5d24d-0719-4798-96c3-812b60168afb" />

---
### Cobra Dashboard
The home dashboard displays balances for both wallets. Bitcoin balances are displayed in bitcoins here instead of sats.

<img width="6013" height="3393" alt="Screenshot from 2026-02-10 10-12-23" src="https://github.com/user-attachments/assets/30549c6d-9164-4862-b92e-4b0cf5659727" />

---

### Ethereum
The Ethereum dashboard looks like this:
```plaintext
Hot balance
Cold balance
dApp balance
Connect dApp
Send
Move
Receive
```
#### dApp Support
I built the wallet with support for connecting to dApps (decentralized applications). This works using Wallet Connect, where you enter a URI from the dApp to initate a connection. The first Etheruem hot key is used as a 'dApp account' used within these applications. Applications can propose transactions that can be approved using a pop-up displayed in the interface.

#### Sending
Sending is fairly simple, you enter an address and an Ether amount to send. The available balance of any one account has to be greater than the send amount to send a transaction, if no one account has an adequate balance accounts can be 'rebalanced'. Transactions are approved using an approve screen that shows the gas amount, transaction fee, and other data.

#### Moving
There's built in functionality for 'moving' funds in a few different ways. The hot wallet can be 'rebalanced' to combine multiple accounts' funds into one account's balance, hot funds can be moved to cold funds, cold funds can be moved to hot funds (requires selecting cold wallet file), and the dApp account can be funded. In any case, moving funds can take place over multiple transactions approved and broadcasted at once.

#### Receving
Funds can be received to the cold wallet or hot wallet.

<img width="6013" height="3393" alt="Screenshot from 2026-02-10 10-13-53" src="https://github.com/user-attachments/assets/d0f98c67-8388-45fc-9796-3051d1e18cb4" />

---
### Bitcoin
The Bitcoin wallet doesn't include legacy tranasactions and uses Segwit for everything. The dashboard looks like this:
```plaintext
Hot balance
Cold balance
Send
Receive
```
#### Sending
Users have the option to send from the hot wallet or the cold wallet, in the latter case the cold wallet file needs to be selected, you enter an address and an amount to send in sats. Spendable UTXOS in the wallet are gathered and signed by their respective private keys and included in one transaction to be broadcasted. Transaction fees are automatically calculated

#### Receving
Funds can be received to the cold wallet or hot wallet.

### Thank you for reading
If you have any questions, feel free to email me at conall-xrs@hotmail.com

<img width="6013" height="3393" alt="Screenshot from 2026-02-10 10-15-28" src="https://github.com/user-attachments/assets/e9a24279-2204-4e5f-8e9a-8b2fd5f78882" />
