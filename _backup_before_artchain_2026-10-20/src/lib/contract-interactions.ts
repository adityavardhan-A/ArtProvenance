/**
 * Thin facade over the chain client.
 *
 * Every function tries the chain directly first (fast, trustless) and falls
 * back to the backend relayer when the browser has no RPC configured or the
 * request fails. Existing call sites keep working unchanged.
 */
import {
  getBlockchainRecord,
  isHashRegisteredOnChain,
  registerArtworkOnBlockchain,
  describeChainError,
  type BlockchainRecord,
  type RegistrationResult,
} from './blockchain';
import { BACKEND_URL, CONTRACT_ADDRESS, RPC_URL } from './chain-config';

export type { BlockchainRecord, RegistrationResult };

const chainReadable = () => Boolean(CONTRACT_ADDRESS && RPC_URL);

/**
 * Register a hash on chain.
 * @param options.useWallet sign with the artist's MetaMask instead of the relayer
 * @param options.creditTo  address to credit as owner when the relayer signs
 */
export async function registerImageHash(
  imageHash: string,
  perceptualHash = '',
  options: { useWallet?: boolean; creditTo?: string } = {}
): Promise<RegistrationResult> {
  return registerArtworkOnBlockchain(imageHash, perceptualHash, options);
}

/** True if the exact file hash exists on chain (or in the relayer's view). */
export async function isHashRegistered(imageHash: string): Promise<boolean> {
  if (chainReadable()) {
    try {
      return await isHashRegisteredOnChain(imageHash);
    } catch (error) {
      console.warn(
        'Direct chain read failed, falling back to backend:',
        describeChainError(error)
      );
    }
  }
  return checkHashViaBackend(imageHash);
}

/** Full provenance record, read from chain with a relayer fallback. */
export async function getProvenance(
  imageHash: string
): Promise<BlockchainRecord | null> {
  if (chainReadable()) {
    try {
      return await getBlockchainRecord(imageHash);
    } catch (error) {
      console.warn(
        'Direct chain read failed, falling back to backend:',
        describeChainError(error)
      );
    }
  }

  try {
    const response = await fetch(`${BACKEND_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageHash }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    return data.registered ? (data.record as BlockchainRecord) : null;
  } catch (error) {
    console.warn('Backend provenance lookup failed:', error);
    return null;
  }
}

export async function checkHashViaBackend(imageHash: string): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/check-hash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageHash }),
    });
    if (!response.ok) return false;

    const data = await response.json();
    return data.registered || false;
  } catch (error) {
    console.warn('Backend hash check failed:', error);
    return false;
  }
}

export interface ChainStatus {
  configured: boolean;
  relayerAvailable: boolean;
  relayerSigning: boolean;
  contractAddress: string | null;
  relayerAddress: string | null;
  relayerBalance: string | null;
  totalRegistered: number | null;
}

/** Ask the relayer what it can actually do - used for the status banner. */
export async function getChainStatus(): Promise<ChainStatus> {
  const base: ChainStatus = {
    configured: chainReadable(),
    relayerAvailable: false,
    relayerSigning: false,
    contractAddress: CONTRACT_ADDRESS || null,
    relayerAddress: null,
    relayerBalance: null,
    totalRegistered: null,
  };

  try {
    const response = await fetch(`${BACKEND_URL}/status`);
    if (!response.ok) return base;

    const data = await response.json();
    return {
      ...base,
      relayerAvailable: true,
      relayerSigning: Boolean(data.canSign),
      contractAddress: data.contractAddress || base.contractAddress,
      relayerAddress: data.relayerAddress ?? null,
      relayerBalance: data.relayerBalance ?? null,
      totalRegistered:
        typeof data.totalRegistered === 'number' ? data.totalRegistered : null,
    };
  } catch {
    return base;
  }
}
