/**
 * Real blockchain integration for artwork provenance.
 *
 * Two write paths are supported:
 *   1. Relayer - the backend signs and pays gas (default; no wallet needed).
 *   2. Wallet  - the artist signs with MetaMask, so msg.sender is genuinely
 *                their address and provenance is self-sovereign.
 *
 * Reads always go straight to the chain over a read-only JSON-RPC provider,
 * so verification works even when nobody has a wallet installed.
 */
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESS,
  RPC_URL,
  BACKEND_URL,
  IMAGE_REGISTRY_ABI,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_NETWORK_PARAMS,
  isChainConfigured,
} from './chain-config';

export interface BlockchainRecord {
  hash: string;
  owner: string;
  registrant: string;
  timestamp: number;
  blockNumber: number;
  perceptualHash: string;
  transactionHash?: string;
}

export interface RegistrationResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  ownerAddress?: string;
  /** 'wallet' = artist signed, 'relayer' = backend signed, 'none' = not written */
  via: 'wallet' | 'relayer' | 'none';
  alreadyRegistered?: boolean;
  error?: string;
}

// ------------------------------------------------------------------ hashing

/** SHA-256 of the raw file bytes, as a 64-character lowercase hex string. */
export async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex digest of any length into a bytes32 value for the contract.
 * SHA-256 fills all 32 bytes; the 64-bit pHash is left-padded with zeros.
 */
export function toBytes32(hexDigest: string): string {
  const clean = (hexDigest || '').trim().toLowerCase().replace(/^0x/, '');

  if (!clean) return ethers.ZeroHash;
  if (!/^[0-9a-f]+$/.test(clean)) {
    throw new Error(`Not a hex digest: "${hexDigest}"`);
  }
  if (clean.length > 64) {
    throw new Error(`Digest too long for bytes32: ${clean.length} hex chars`);
  }

  return '0x' + clean.padStart(64, '0');
}

/** Inverse of toBytes32 for a pHash: strips the zero padding back to 16 chars. */
export function bytes32ToPerceptualHash(value: string): string {
  return (value || '').replace(/^0x/, '').slice(-16);
}

// ---------------------------------------------------------------- providers

let cachedReadProvider: ethers.JsonRpcProvider | null = null;

function getReadProvider(): ethers.JsonRpcProvider {
  if (!RPC_URL) {
    throw new Error(
      'VITE_PUBLIC_SEPOLIA_RPC_URL is not set - cannot read from the blockchain.'
    );
  }
  if (!cachedReadProvider) {
    cachedReadProvider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: SEPOLIA_CHAIN_ID,
      name: 'sepolia',
    });
  }
  return cachedReadProvider;
}

/** Read-only contract instance backed by the public RPC endpoint. */
export function getReadContract(): ethers.Contract {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      'VITE_CONTRACT_ADDRESS is not set - deploy the contract and add it to .env.'
    );
  }
  return new ethers.Contract(
    CONTRACT_ADDRESS,
    IMAGE_REGISTRY_ABI as unknown as string[],
    getReadProvider()
  );
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).ethereum);
}

/** Prompt the wallet to connect, switching to (or adding) Sepolia as needed. */
export async function connectWallet(): Promise<string> {
  const injected = (window as any).ethereum;
  if (!injected) {
    throw new Error(
      'No wallet detected. Install MetaMask to sign your own registrations.'
    );
  }

  const accounts: string[] = await injected.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) {
    throw new Error('Wallet connection was rejected.');
  }

  await ensureSepolia();
  return ethers.getAddress(accounts[0]);
}

export async function ensureSepolia(): Promise<void> {
  const injected = (window as any).ethereum;
  if (!injected) return;

  const currentChainId: string = await injected.request({ method: 'eth_chainId' });
  if (currentChainId?.toLowerCase() === SEPOLIA_CHAIN_ID_HEX) return;

  try {
    await injected.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (error: any) {
    // 4902 = chain unknown to the wallet; adding it also switches to it.
    if (error?.code === 4902) {
      await injected.request({
        method: 'wallet_addEthereumChain',
        params: [SEPOLIA_NETWORK_PARAMS],
      });
      return;
    }
    throw error;
  }
}

/** Contract instance bound to the connected wallet's signer. */
export async function getSignerContract(): Promise<ethers.Contract> {
  const injected = (window as any).ethereum;
  if (!injected) throw new Error('No wallet detected.');
  if (!CONTRACT_ADDRESS) throw new Error('VITE_CONTRACT_ADDRESS is not set.');

  await ensureSepolia();

  const provider = new ethers.BrowserProvider(injected);
  const signer = await provider.getSigner();

  return new ethers.Contract(
    CONTRACT_ADDRESS,
    IMAGE_REGISTRY_ABI as unknown as string[],
    signer
  );
}

// -------------------------------------------------------------------- reads

/** Does this exact file already exist on chain? */
export async function isHashRegisteredOnChain(fileHash: string): Promise<boolean> {
  const contract = getReadContract();
  return await contract.isHashRegistered(toBytes32(fileHash));
}

/** Full provenance record, or null if the hash was never registered. */
export async function getBlockchainRecord(
  fileHash: string
): Promise<BlockchainRecord | null> {
  const contract = getReadContract();
  const result = await contract.getRecord(toBytes32(fileHash));

  const [exists, owner, registrant, timestamp, blockNumber, perceptualHash] = result;
  if (!exists) return null;

  return {
    hash: fileHash,
    owner,
    registrant,
    timestamp: Number(timestamp) * 1000, // contract stores seconds
    blockNumber: Number(blockNumber),
    perceptualHash: bytes32ToPerceptualHash(perceptualHash),
  };
}

/** Existence check for many hashes in a single RPC round trip. */
export async function areHashesRegistered(fileHashes: string[]): Promise<boolean[]> {
  if (!fileHashes.length) return [];
  const contract = getReadContract();
  return await contract.areHashesRegistered(fileHashes.map(toBytes32));
}

/**
 * Pull every stored pHash, so similarity can be checked against the chain
 * itself rather than only against the Supabase mirror.
 */
export async function fetchAllPerceptualHashes(
  pageSize = 200
): Promise<Array<{ hash: string; perceptualHash: string }>> {
  const contract = getReadContract();
  const total = Number(await contract.getTotalRegisteredHashes());
  const out: Array<{ hash: string; perceptualHash: string }> = [];

  for (let offset = 0; offset < total; offset += pageSize) {
    const [cryptoHashes, perceptualHashes] = await contract.getPerceptualHashPage(
      offset,
      pageSize
    );
    for (let i = 0; i < cryptoHashes.length; i++) {
      out.push({
        hash: cryptoHashes[i].replace(/^0x/, ''),
        perceptualHash: bytes32ToPerceptualHash(perceptualHashes[i]),
      });
    }
  }

  return out;
}

export async function getTotalRegistered(): Promise<number> {
  const contract = getReadContract();
  return Number(await contract.getTotalRegisteredHashes());
}

// ------------------------------------------------------------------- writes

/**
 * Register artwork on chain.
 *
 * With `useWallet` the artist's wallet signs directly. Otherwise the backend
 * relayer signs and pays, crediting ownership to `creditTo` when supplied.
 */
export async function registerArtworkOnBlockchain(
  fileHash: string,
  perceptualHash: string,
  options: { useWallet?: boolean; creditTo?: string } = {}
): Promise<RegistrationResult> {
  const { useWallet = false, creditTo } = options;

  return useWallet
    ? registerViaWallet(fileHash, perceptualHash)
    : registerViaRelayer(fileHash, perceptualHash, creditTo);
}

async function registerViaWallet(
  fileHash: string,
  perceptualHash: string
): Promise<RegistrationResult> {
  try {
    const contract = await getSignerContract();
    const signerAddress = await (contract.runner as ethers.Signer).getAddress();

    const tx = await contract.registerImage(
      toBytes32(fileHash),
      toBytes32(perceptualHash)
    );
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      ownerAddress: signerAddress,
      via: 'wallet',
    };
  } catch (error: any) {
    return {
      success: false,
      via: 'wallet',
      alreadyRegistered: isAlreadyRegisteredError(error),
      error: describeChainError(error),
    };
  }
}

async function registerViaRelayer(
  fileHash: string,
  perceptualHash: string,
  creditTo?: string
): Promise<RegistrationResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/register-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageHash: fileHash,
        perceptualHash,
        ownerAddress: creditTo || null,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 409) {
      return {
        success: false,
        via: 'relayer',
        alreadyRegistered: true,
        error: data.error || 'Already registered on chain.',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        via: 'relayer',
        error: data.error || `Relayer returned ${response.status}.`,
      };
    }

    return {
      success: true,
      transactionHash: data.transactionHash,
      blockNumber: data.blockNumber,
      ownerAddress: data.ownerAddress,
      via: 'relayer',
    };
  } catch (error: any) {
    return {
      success: false,
      via: 'none',
      error: `Relayer unreachable at ${BACKEND_URL}: ${error.message}`,
    };
  }
}

/** Transfer provenance ownership. Requires the current owner's wallet. */
export async function transferArtworkOwnership(
  fileHash: string,
  newOwner: string
): Promise<RegistrationResult> {
  try {
    const contract = await getSignerContract();
    const tx = await contract.transferOwnership(toBytes32(fileHash), newOwner);
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      ownerAddress: newOwner,
      via: 'wallet',
    };
  } catch (error: any) {
    return { success: false, via: 'wallet', error: describeChainError(error) };
  }
}

// ------------------------------------------------------------- error helpers

/** 4-byte selector of AlreadyRegistered(bytes32). */
const ALREADY_REGISTERED_SELECTOR = '0x77caf672';

/**
 * Detect the duplicate-registration revert.
 *
 * Checked three ways because nodes disagree about how much they return:
 * a decoded custom error (ethers with full revert data), the raw selector
 * (node returns data but ethers can't decode it), or plain message text.
 */
function isAlreadyRegisteredError(error: any): boolean {
  if (error?.revert?.name === 'AlreadyRegistered') return true;

  const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data;
  if (typeof data === 'string' && data.startsWith(ALREADY_REGISTERED_SELECTOR)) {
    return true;
  }

  const text = `${error?.message ?? ''} ${error?.shortMessage ?? ''} ${error?.reason ?? ''}`;
  return /AlreadyRegistered|already registered/i.test(text);
}

/** Turn an ethers/provider error into something worth showing a user. */
export function describeChainError(error: any): string {
  if (isAlreadyRegisteredError(error)) {
    return 'This artwork is already registered on the blockchain.';
  }
  if (error?.code === 'ACTION_REJECTED' || error?.code === 4001) {
    return 'Transaction rejected in your wallet.';
  }
  if (error?.code === 'INSUFFICIENT_FUNDS') {
    return 'Not enough Sepolia ETH to pay for gas. Top up from a faucet.';
  }
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'SERVER_ERROR') {
    return 'Could not reach the Sepolia RPC endpoint. Check VITE_PUBLIC_SEPOLIA_RPC_URL.';
  }
  return (
    error?.shortMessage || error?.reason || error?.message || 'Unknown blockchain error.'
  );
}

export { isChainConfigured };
