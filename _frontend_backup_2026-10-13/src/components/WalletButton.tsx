import { Wallet, AlertTriangle } from 'lucide-react';
import { useWallet, shortenAddress } from '../contexts/WalletContext';
import { addressExplorerUrl } from '../lib/chain-config';

/**
 * Optional wallet connection control.
 *
 * Hidden entirely when no injected wallet exists, so users without MetaMask
 * are never shown a dead button — the relayer handles their registrations.
 */
export default function WalletButton() {
  const {
    address,
    isConnected,
    isCorrectNetwork,
    walletAvailable,
    connecting,
    connect,
    disconnect,
  } = useWallet();

  if (!walletAvailable) return null;

  if (!isConnected) {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        title="Optional: sign your own registrations so you own them on chain"
        className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
      >
        <Wallet className="h-4 w-4" />
        <span>{connecting ? 'Connecting…' : 'Connect Wallet'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {!isCorrectNetwork && (
        <span
          title="Switch to Sepolia to register artwork"
          className="flex items-center space-x-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium"
        >
          <AlertTriangle className="h-3 w-3" />
          <span>Wrong network</span>
        </span>
      )}

      <a
        href={addressExplorerUrl(address!)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
      >
        <Wallet className="h-4 w-4" />
        <span className="font-mono">{shortenAddress(address!)}</span>
      </a>

      <button
        onClick={disconnect}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        title="Forget this wallet"
      >
        Disconnect
      </button>
    </div>
  );
}
