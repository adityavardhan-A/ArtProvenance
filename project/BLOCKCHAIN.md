# ArtChain — the blockchain behind ArtProvenance

ArtChain is a proof-of-work blockchain written from scratch for this project. It
runs as a small peer-to-peer network of nodes on your own computer. There is no
Ethereum, no cryptocurrency, no gas fees, no faucet and no external service:
it is completely free to run, and works offline.

Supabase (or the built-in local mock) is used **only for email login**. Every
fact about an artwork — who made it, who owns it, every transfer and every
forgery report — lives on the chain. The image files themselves are kept in a
content-addressed store on the nodes, keyed by the same SHA-256 that goes on
chain.

---

## Run it

Two terminals, from `project/`:

```powershell
# Terminal 1: start a 3-node network on ports 4001, 4002, 4003
cd server
npm install          # first time only (express + cors, nothing else)
npm start

# Terminal 2: the website
cd ..
npm install          # first time only
npm run dev          # http://localhost:5174
```

Sign up, then go to **Explorer** to watch blocks appear as you register works.

Useful extras:

| Command (in `server/`) | What it does |
|---|---|
| `npm start` | three nodes in one terminal, coloured logs |
| `node network.js 5` | five nodes instead |
| `npm run node1` / `node2` / `node3` | one node per terminal (to kill one and watch the others carry on) |
| `node server.js --difficulty 5` | mine at 5 leading zeros (~16× slower) |
| `npm test` | the test suite (12 tests, includes a live 3-node network) |

Chain data lives in `server/data/node-N/` (`chain.json`, `mempool.json`,
`files/`, `node-key.json`). Delete `server/data` to start a brand-new chain.

---

## Which blockchain concepts are used, and where

| Concept | How ArtChain uses it | Code |
|---|---|---|
| **Blocks** | header (index, timestamp, previousHash, merkleRoot, difficulty, nonce, miner) + transactions | `server/chain/block.js` |
| **Hash chaining** | each block stores the SHA-256 of the previous block's header | `block.js`, `blockchain.js → checkBlock` |
| **Genesis block** | fixed, identical on every node | `block.js → createGenesisBlock` |
| **Proof-of-work mining** | find a nonce so the header hash starts with *N* zeros (default 4 ≈ 65,536 tries) | `block.js → mine` |
| **Merkle tree** | root of all transaction ids in the header; Merkle proofs for any transaction | `server/chain/merkle.js` |
| **Public-key cryptography** | every artist has an ECDSA P-256 key pair generated in their browser | `src/lib/wallet.ts` |
| **Digital signatures** | every transaction is signed; nodes reject unsigned or altered ones | `server/chain/transaction.js`, `crypto.js` |
| **Addresses** | `ac` + first 40 hex of SHA-256(public key) | `crypto.js → addressFromPublicKey` |
| **Transactions** | IDENTITY, REGISTER, TRANSFER, REPORT | `transaction.js` |
| **Mempool** | signed transactions wait here until mined | `blockchain.js → addTransaction` |
| **On-chain rules ("smart contract")** | no duplicate files, no near-copies of other artists' work, only owners can transfer | `server/chain/state.js` |
| **World state** | registry rebuilt by replaying every block from genesis | `state.js`, `blockchain.js → validateChain` |
| **Replay protection** | a transaction id can appear on chain only once | `state.js` |
| **Peer-to-peer network** | nodes gossip transactions and blocks, discover each other, sync | `server/chain/p2p.js` |
| **Consensus / fork choice** | the valid chain with the most total work wins; ties go to the lower tip hash | `blockchain.js → replaceChain` |
| **Orphaned transactions** | transactions from a losing fork go back to the mempool | `replaceChain` |
| **Confirmations** | how many blocks sit on top of a transaction | everywhere in the UI |
| **Immutability / tamper detection** | any edit breaks hashes, Merkle root, PoW or signatures; a tampered chain on disk is quarantined at startup | `validateChain`, `tamperDemo`, `load` |
| **Light-client verification** | the browser re-checks signature, Merkle path, block hash, PoW and link itself | `src/lib/artchain.ts → verifyInclusion` |
| **Content addressing (IPFS-style)** | images stored and fetched by SHA-256; nodes replicate them from each other and reject bytes that don't match | `server/chain/filestore.js` |
| **Wallet backup** | private key exported encrypted with PBKDF2 + AES-256-GCM | `wallet.ts → exportKeystore` |
| **Block explorer** | blocks, transactions, addresses, Merkle trees, mempool, network, validation, tamper test | `src/pages/ExplorerPage.tsx` |

---

## Transaction types

| Type | Payload | Rule enforced by every node |
|---|---|---|
| `IDENTITY` | `name` | binds a display name to the sender's address |
| `REGISTER` | `fileHash`, `perceptualHash`, `title`, `description`, `mimeType`, `size` | file not already registered; perceptual hash not within 10 bits of a work by **another** artist |
| `TRANSFER` | `fileHash`, `to`, `note` | sender must be the current owner |
| `REPORT` | `suspectHash`, `originalHash`, `distance`, `note` | original must exist; one report per reporter per copy |

Each transaction is `{ id, type, from, publicKey, payload, timestamp, signature }`.
`id = SHA-256(canonical JSON of everything except id and signature)`, and the
signature is ECDSA-SHA256 over that id.

## What a registration goes through

1. Browser rejects screenshots, computes SHA-256 and a 64-bit perceptual hash.
2. Browser asks the chain whether the file, or something visually close, exists.
3. Image is uploaded to the node's content store under its SHA-256.
4. Browser signs a `REGISTER` transaction with the artist's private key.
5. Node checks signature and rules, puts it in the mempool, gossips it to peers.
6. Within a couple of seconds a node mines a block containing it and broadcasts it.
7. Every other node re-validates the block (hash, PoW, Merkle root, signatures,
   rules) before accepting it, and pulls the image file if it doesn't have it.

## Demo script (for a viva / presentation)

1. `npm start` in `server/` — show three nodes starting with the same genesis hash.
2. Register a work; read the seven steps aloud as they tick; point at the node logs
   (`entered mempool`, `mined #N … nonce …`, `accepted block #N from …`).
3. Open the certificate, press **Verify this record in my browser**.
4. Register a resized copy of it as a different user — it is refused.
5. **Verify** that copy, then **Report this copy on ArtChain** — the report is mined.
6. Transfer a work to the other user; show the provenance timeline.
7. Explorer → **Run all checks**, then **Try to rewrite history**: all three forgeries fail.
8. Stop one node (Ctrl+C on `npm run node2`), register something, restart it —
   it catches up from its peers.
9. Edit `server/data/node-1/chain.json` by hand and restart — the node detects the
   tampering, quarantines the file and resyncs.

## Node API

| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | height, difficulty, work, mempool, mining stats, peers |
| GET | `/blocks?before=&limit=` | block summaries, newest first |
| GET | `/blocks/:indexOrHash` | full block with Merkle levels |
| POST | `/tx` | submit a signed transaction |
| GET | `/tx/:id`, `/tx/:id/proof` | status and Merkle proof |
| GET | `/mempool` | pending transactions |
| GET | `/artworks`, `/artworks/:hash` | registry state with provenance |
| GET | `/similar/:phash?max=20` | nearest perceptual matches |
| GET | `/accounts/:address`, `/identities` | per-address view, names |
| GET | `/chain/validate` | full re-validation report |
| POST | `/chain/tamper-demo` | forge copies of the chain and validate them |
| POST | `/mine` | mine pending transactions now |
| POST/GET | `/files`, `/files/:hash` | content-addressed image store |
| — | `/p2p/*` | hello, tip, chain, tx, block gossip between nodes |

## Honest limits

- All nodes run on one machine, so this demonstrates consensus rather than
  providing real decentralisation. Nodes can run on other machines by passing
  `--url http://<ip>:<port>` and peers' LAN addresses.
- Proof-of-work at difficulty 4 is cheap; it shows the mechanism, it doesn't
  provide real-world security. Raise `--difficulty` to make re-mining costlier.
- If an artist loses both their browser storage and their wallet backup, their
  works stay registered but can't be transferred again.
- Perceptual hashing catches resized and recompressed copies, not heavy edits or crops.
