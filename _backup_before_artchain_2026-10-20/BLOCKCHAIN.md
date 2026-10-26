# Blockchain Integration

Artwork provenance is recorded in the `ImageRegistry` contract on Sepolia.
This document covers how it works and how to run it.

## What is stored on chain

Per artwork, keyed by the SHA-256 digest of the file bytes:

| Field            | Meaning                                        |
|------------------|------------------------------------------------|
| `owner`          | provenance owner (the artist)                  |
| `registrant`     | account that submitted and paid for the tx     |
| `timestamp`      | block timestamp of registration                |
| `blockNumber`    | block height of registration                   |
| `perceptualHash` | pHash, for detecting resized/recompressed copies |

Hashes are `bytes32`, not strings — a SHA-256 digest is exactly 32 bytes, so
this is cheaper and fixed-width. The 64-bit pHash is left-padded into a
`bytes32`.

## Who signs

Two paths, both supported at once:

- **Relayer (default).** The backend signs with `PRIVATE_KEY` and pays gas.
  Users need no wallet. If the artist has a wallet connected, the relayer
  calls `registerImageFor` and credits ownership to their address.
- **Wallet (optional).** If MetaMask is connected on Sepolia, the browser
  signs `registerImage` directly, so `msg.sender` is genuinely the artist.
  The artist pays their own gas.

The Upload tab states which path will be used before you submit.

## Failure behaviour

If the chain write fails, **the upload still succeeds**. The row is saved with
`chain_status = 'pending'` and `chain_error` set, and the UI shows an amber
"Pending blockchain registration" badge instead of a green one. Nothing is
silently lost, and the database never claims something is on chain when it
isn't.

## Setup

### 1. Environment

Copy `.env.example` to `.env` and fill it in. The backend reads this same file,
so you only need one copy at `project/.env`.

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_PUBLIC_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<key>
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<key>
PRIVATE_KEY=<relayer key, funded with Sepolia ETH>
VITE_CONTRACT_ADDRESS=<from step 3>
CONTRACT_ADDRESS=<from step 3>
```

Use a throwaway key. Never one holding real funds.

### 2. Database migration

Apply `supabase/migrations/20260803000000_add_blockchain_proof.sql` to your
Supabase project. It adds `tx_hash`, `block_number`, `owner_address`,
`chain_status`, `chain_error` and `registered_at` to `artwork_metadata`.

### 3. Compile and deploy the contract

```powershell
cd "C:\Users\adity\OneDrive\Desktop\PROJECTS\Block chain\project"
npx hardhat compile
npx tsx scripts/deploy.ts
```

The script prints the address, writes `deployments/sepolia.json`, and tells you
the `VITE_CONTRACT_ADDRESS` line to add to `.env`. It refuses to run if the
deployer has no ETH.

### 4. Run

Two terminals.

```powershell
# Terminal 1 - relayer
cd "C:\Users\adity\OneDrive\Desktop\PROJECTS\Block chain\project\server"
npm install
npm start
```

On startup it prints whether RPC, contract and signer are configured, plus the
relayer balance. If it says `MISSING`, registrations fall back to in-memory
storage and nothing reaches the chain.

```powershell
# Terminal 2 - frontend
cd "C:\Users\adity\OneDrive\Desktop\PROJECTS\Block chain\project"
npm install --legacy-peer-deps
npm run dev
```

`--legacy-peer-deps` is required: `hardhat-chai-matchers@2` wants
`hardhat-ethers@^3` while the project uses `^4`. The conflict is confined to
Hardhat dev tooling and does not affect the app.

The frontend runs on **http://localhost:5174** (set in `vite.config.ts`).

## Backend API

| Endpoint              | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `GET  /status`        | config, relayer address, balance, total registered |
| `POST /register-image`| register a hash; 409 if already present          |
| `POST /check-hash`    | boolean existence check                          |
| `POST /verify`        | full provenance record                           |
| `POST /check-hashes`  | batch existence check                            |

## Notes

- Writes are serialised through a queue. A single relayer key means concurrent
  uploads would otherwise build transactions against the same nonce and most
  would be dropped.
- JSON-RPC request batching is disabled (`batchMaxCount: 1`); some hosted
  endpoints mishandle batched payloads, which surfaces as an opaque
  "could not coalesce error".
- Duplicate detection matches the `AlreadyRegistered` revert three ways —
  decoded custom error, raw 4-byte selector `0x77caf672`, and message text —
  because nodes differ in how much revert data they return.

## Perceptual hash precision (fixed 2026-10-13)

`computeDCTHash` and `calculateHammingDistance` in `src/lib/perceptual-hash.ts`
used `parseInt` on a 64-bit value. JavaScript numbers hold 53 bits exactly, so
the low bits were zeroed and unrelated images looked alike (in testing, about
1 in 7 unrelated pairs fell inside the "similar" threshold). Both now use
`BigInt`, and no unrelated pair did. Hashes keep the same 16-hex-char format;
any old rows differ from a fresh hash only in those low bits, which is within
the similarity threshold.
