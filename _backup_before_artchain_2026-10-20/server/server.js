/**
 * Relayer backend for the artwork provenance registry.
 *
 * Signs ImageRegistry transactions on behalf of artists who don't have a
 * wallet, and exposes read endpoints so the frontend can verify provenance
 * even without an RPC URL of its own.
 *
 * Env (read from ../.env, falling back to ./.env):
 *   SEPOLIA_RPC_URL | VITE_PUBLIC_SEPOLIA_RPC_URL   JSON-RPC endpoint
 *   PRIVATE_KEY                                     relayer signing key
 *   CONTRACT_ADDRESS | VITE_CONTRACT_ADDRESS        deployed ImageRegistry
 *   SERVER_PORT                                     default 3001
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

// Load the shared project-level .env first, then any server-local override.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const app = express();
const port = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --------------------------------------------------------------- chain setup

const RPC_URL =
  process.env.SEPOLIA_RPC_URL || process.env.VITE_PUBLIC_SEPOLIA_RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

/** Resolve the contract address from env, else from deployments/sepolia.json. */
function resolveContractAddress() {
  const fromEnv =
    process.env.CONTRACT_ADDRESS || process.env.VITE_CONTRACT_ADDRESS || '';
  if (fromEnv) return fromEnv;

  const deploymentFile = path.resolve(__dirname, '../deployments/sepolia.json');
  if (fs.existsSync(deploymentFile)) {
    try {
      return JSON.parse(fs.readFileSync(deploymentFile, 'utf8')).address || '';
    } catch {
      return '';
    }
  }
  return '';
}

const CONTRACT_ADDRESS = resolveContractAddress();

// Keep the ABI in one place; must match contracts/ImageRegistry.sol.
const IMAGE_REGISTRY_ABI = [
  'function registerImage(bytes32 cryptographicHash, bytes32 perceptualHash) external',
  'function registerImageFor(bytes32 cryptographicHash, bytes32 perceptualHash, address owner) external',
  'function isHashRegistered(bytes32 cryptographicHash) external view returns (bool)',
  'function getRecord(bytes32 cryptographicHash) external view returns (bool exists, address owner, address registrant, uint64 timestamp, uint64 blockNumber, bytes32 perceptualHash)',
  'function getTotalRegisteredHashes() external view returns (uint256)',
  'function areHashesRegistered(bytes32[] hashes) external view returns (bool[])',
  'error AlreadyRegistered(bytes32 cryptographicHash)',
  'error NotRegistered(bytes32 cryptographicHash)',
  'error ZeroHash()',
];

function isValidPrivateKey(key) {
  if (!key) return false;
  const clean = String(key).trim().replace(/^0x/, '');
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

// batchMaxCount:1 disables JSON-RPC request batching. Some hosted endpoints
// mishandle batched payloads, which surfaces as an opaque "could not coalesce
// error". At relayer volumes the extra round trips cost nothing.
const provider = RPC_URL
  ? new ethers.JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 })
  : null;
const wallet = provider && isValidPrivateKey(PRIVATE_KEY) ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

const readContract =
  provider && CONTRACT_ADDRESS
    ? new ethers.Contract(CONTRACT_ADDRESS, IMAGE_REGISTRY_ABI, provider)
    : null;

const writeContract =
  wallet && CONTRACT_ADDRESS
    ? new ethers.Contract(CONTRACT_ADDRESS, IMAGE_REGISTRY_ABI, wallet)
    : null;

/** Fallback store used when the chain isn't configured, so demos still run. */
const memoryStore = new Map();

// ------------------------------------------------------------------- helpers

/** Normalise a hex digest into a bytes32 value (left-padded with zeros). */
function toBytes32(hexDigest) {
  const clean = String(hexDigest || '').trim().toLowerCase().replace(/^0x/, '');
  if (!clean) return ethers.ZeroHash;
  if (!/^[0-9a-f]+$/.test(clean)) throw new Error(`Not a hex digest: "${hexDigest}"`);
  if (clean.length > 64) throw new Error(`Digest too long for bytes32: ${clean.length}`);
  return '0x' + clean.padStart(64, '0');
}

function bytes32ToPerceptualHash(value) {
  return String(value || '').replace(/^0x/, '').slice(-16);
}

/** 4-byte selector of AlreadyRegistered(bytes32). */
const ALREADY_REGISTERED_SELECTOR = '0x77caf672';

/**
 * Detect the duplicate-registration revert. Checked three ways because nodes
 * disagree about how much revert data they return: decoded custom error, raw
 * selector, or plain message text.
 */
function isAlreadyRegistered(error) {
  if (error?.revert?.name === 'AlreadyRegistered') return true;

  const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data;
  if (typeof data === 'string' && data.startsWith(ALREADY_REGISTERED_SELECTOR)) {
    return true;
  }

  const text = `${error?.message ?? ''} ${error?.shortMessage ?? ''} ${error?.reason ?? ''}`;
  return /AlreadyRegistered|already registered/i.test(text);
}

/**
 * Serialise writes.
 *
 * A single relayer key means concurrent uploads would otherwise all build
 * transactions against the same nonce and most would be dropped. Chaining
 * every write onto one promise keeps nonces strictly sequential.
 */
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const result = writeQueue.then(task, task);
  // Swallow rejection on the chain itself so one failure doesn't poison the queue.
  writeQueue = result.catch(() => {});
  return result;
}

// ----------------------------------------------------------------- endpoints

app.get('/status', async (_req, res) => {
  const status = {
    chainConfigured: Boolean(readContract),
    canSign: Boolean(writeContract),
    contractAddress: CONTRACT_ADDRESS || null,
    relayerAddress: wallet ? wallet.address : null,
    relayerBalance: null,
    totalRegistered: null,
    network: null,
  };

  try {
    if (provider) {
      const network = await provider.getNetwork();
      status.network = { name: network.name, chainId: Number(network.chainId) };
    }
    if (wallet) {
      status.relayerBalance = ethers.formatEther(await provider.getBalance(wallet.address));
    }
    if (readContract) {
      status.totalRegistered = Number(await readContract.getTotalRegisteredHashes());
    }
  } catch (error) {
    status.error = error.message;
  }

  res.json(status);
});

app.post('/register-image', async (req, res) => {
  const { imageHash, perceptualHash, ownerAddress } = req.body || {};

  if (!imageHash) {
    return res.status(400).json({ error: 'Image hash is required.' });
  }

  let cryptoHashBytes;
  let perceptualHashBytes;
  try {
    cryptoHashBytes = toBytes32(imageHash);
    perceptualHashBytes = toBytes32(perceptualHash || '');
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let owner = null;
  if (ownerAddress) {
    try {
      owner = ethers.getAddress(ownerAddress);
    } catch {
      return res.status(400).json({ error: `Invalid owner address: ${ownerAddress}` });
    }
  }

  // No chain configured: keep the app usable, but say so explicitly.
  if (!writeContract) {
    if (memoryStore.has(imageHash)) {
      return res.status(409).json({ error: 'Image hash already registered.' });
    }
    memoryStore.set(imageHash, { timestamp: Date.now(), perceptualHash, owner });

    return res.status(200).json({
      message: 'Stored in memory - blockchain not configured.',
      inMemory: true,
      warning: !CONTRACT_ADDRESS
        ? 'CONTRACT_ADDRESS is not set. Deploy the contract and set it in .env.'
        : 'PRIVATE_KEY or RPC URL missing. Set both to write on chain.',
    });
  }

  try {
    const alreadyThere = await readContract.isHashRegistered(cryptoHashBytes);
    if (alreadyThere) {
      return res.status(409).json({ error: 'Image hash already registered on blockchain.' });
    }

    const receiptData = await enqueueWrite(async () => {
      const tx = owner
        ? await writeContract.registerImageFor(cryptoHashBytes, perceptualHashBytes, owner)
        : await writeContract.registerImage(cryptoHashBytes, perceptualHashBytes);

      console.log(`[register] ${imageHash.slice(0, 12)}... -> tx ${tx.hash}`);
      const receipt = await tx.wait();
      return { hash: tx.hash, blockNumber: receipt.blockNumber };
    });

    res.status(200).json({
      message: 'Image hash registered on chain.',
      transactionHash: receiptData.hash,
      blockNumber: receiptData.blockNumber,
      ownerAddress: owner || wallet.address,
      explorerUrl: `https://sepolia.etherscan.io/tx/${receiptData.hash}`,
    });
  } catch (error) {
    console.error('Error registering image hash:', error.shortMessage || error.message);

    if (isAlreadyRegistered(error)) {
      return res.status(409).json({ error: 'Image hash already registered on blockchain.' });
    }

    res.status(500).json({
      error: 'Failed to register image hash.',
      details: error.shortMessage || error.message,
    });
  }
});

app.post('/check-hash', async (req, res) => {
  const { imageHash } = req.body || {};
  if (!imageHash) {
    return res.status(400).json({ error: 'Image hash is required.' });
  }

  if (!readContract) {
    return res.status(200).json({
      registered: memoryStore.has(imageHash),
      inMemory: true,
    });
  }

  try {
    const registered = await readContract.isHashRegistered(toBytes32(imageHash));
    res.status(200).json({ registered });
  } catch (error) {
    console.error('Error checking hash:', error.shortMessage || error.message);
    res.status(200).json({ registered: false, error: error.shortMessage || error.message });
  }
});

app.post('/verify', async (req, res) => {
  const { imageHash } = req.body || {};
  if (!imageHash) {
    return res.status(400).json({ error: 'Image hash is required.' });
  }

  if (!readContract) {
    const local = memoryStore.get(imageHash);
    return res.status(200).json({
      registered: Boolean(local),
      inMemory: true,
      record: local
        ? {
            hash: imageHash,
            owner: local.owner,
            timestamp: local.timestamp,
            perceptualHash: local.perceptualHash,
          }
        : null,
    });
  }

  try {
    const [exists, owner, registrant, timestamp, blockNumber, perceptualHash] =
      await readContract.getRecord(toBytes32(imageHash));

    if (!exists) {
      return res.status(200).json({ registered: false, record: null });
    }

    res.status(200).json({
      registered: true,
      record: {
        hash: imageHash,
        owner,
        registrant,
        timestamp: Number(timestamp) * 1000,
        blockNumber: Number(blockNumber),
        perceptualHash: bytes32ToPerceptualHash(perceptualHash),
      },
      explorerUrl: `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`,
    });
  } catch (error) {
    console.error('Error verifying hash:', error.shortMessage || error.message);
    res.status(500).json({ error: error.shortMessage || error.message });
  }
});

/** Batch existence check so the gallery can badge many artworks at once. */
app.post('/check-hashes', async (req, res) => {
  const { imageHashes } = req.body || {};
  if (!Array.isArray(imageHashes)) {
    return res.status(400).json({ error: 'imageHashes must be an array.' });
  }
  if (!imageHashes.length) return res.status(200).json({ results: {} });

  if (!readContract) {
    const results = {};
    imageHashes.forEach((h) => { results[h] = memoryStore.has(h); });
    return res.status(200).json({ results, inMemory: true });
  }

  try {
    const flags = await readContract.areHashesRegistered(imageHashes.map(toBytes32));
    const results = {};
    imageHashes.forEach((h, i) => { results[h] = Boolean(flags[i]); });
    res.status(200).json({ results });
  } catch (error) {
    console.error('Error batch checking hashes:', error.shortMessage || error.message);
    res.status(500).json({ error: error.shortMessage || error.message });
  }
});

// ------------------------------------------------------------------- startup

app.listen(port, async () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log(`  RPC:      ${RPC_URL ? 'configured' : 'MISSING'}`);
  console.log(`  Contract: ${CONTRACT_ADDRESS || 'MISSING'}`);
  console.log(`  Signer:   ${wallet ? wallet.address : 'MISSING (read-only)'}`);

  if (!writeContract) {
    console.warn(
      '\n  ⚠  Not able to write on chain. Registrations fall back to in-memory storage.\n' +
        '     Set SEPOLIA_RPC_URL, PRIVATE_KEY and CONTRACT_ADDRESS in project/.env.\n'
    );
    return;
  }

  try {
    const balance = await provider.getBalance(wallet.address);
    console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);
    if (balance === 0n) {
      console.warn('  ⚠  Relayer has no Sepolia ETH — transactions will fail.');
    }
  } catch (error) {
    console.warn(`  ⚠  Could not reach RPC: ${error.shortMessage || error.message}`);
  }
});
