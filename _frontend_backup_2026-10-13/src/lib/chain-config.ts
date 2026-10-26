/**
 * Single source of truth for chain constants shared by the frontend.
 *
 * The ABI is declared here in human-readable form rather than imported from
 * artifacts/, because that directory lives outside src/ and is a build output,
 * not source. Keep it in sync with contracts/ImageRegistry.sol.
 */

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';

export const SEPOLIA_NETWORK_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: 'Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

/** Deployed ImageRegistry address. Override per-environment via .env. */
export const CONTRACT_ADDRESS: string =
  import.meta.env.VITE_CONTRACT_ADDRESS || '';

/** Read-only RPC endpoint used for verification when no wallet is connected. */
export const RPC_URL: string =
  import.meta.env.VITE_PUBLIC_SEPOLIA_RPC_URL || '';

/** Base URL of the relayer backend. */
export const BACKEND_URL: string =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const IMAGE_REGISTRY_ABI = [
  'function registerImage(bytes32 cryptographicHash, bytes32 perceptualHash) external',
  'function registerImageFor(bytes32 cryptographicHash, bytes32 perceptualHash, address owner) external',
  'function transferOwnership(bytes32 cryptographicHash, address newOwner) external',
  'function isHashRegistered(bytes32 cryptographicHash) external view returns (bool)',
  'function getRecord(bytes32 cryptographicHash) external view returns (bool exists, address owner, address registrant, uint64 timestamp, uint64 blockNumber, bytes32 perceptualHash)',
  'function getHashesByPerceptualHash(bytes32 perceptualHash) external view returns (bytes32[])',
  'function getTotalRegisteredHashes() external view returns (uint256)',
  'function getHashAtIndex(uint256 index) external view returns (bytes32)',
  'function getPerceptualHashPage(uint256 offset, uint256 limit) external view returns (bytes32[] cryptographicHashes, bytes32[] perceptualHashes)',
  'function areHashesRegistered(bytes32[] hashes) external view returns (bool[])',
  'event ImageRegistered(bytes32 indexed cryptographicHash, bytes32 indexed perceptualHash, address indexed owner, address registrant, uint256 timestamp)',
  'event OwnershipTransferred(bytes32 indexed cryptographicHash, address indexed previousOwner, address indexed newOwner)',
  'error AlreadyRegistered(bytes32 cryptographicHash)',
  'error NotRegistered(bytes32 cryptographicHash)',
  'error NotOwner(bytes32 cryptographicHash, address caller)',
  'error ZeroHash()',
  'error IndexOutOfBounds(uint256 index, uint256 length)',
] as const;

/** True when a contract address and an RPC endpoint are both configured. */
export function isChainConfigured(): boolean {
  return Boolean(CONTRACT_ADDRESS && RPC_URL);
}

export function txExplorerUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

export function addressExplorerUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
