import { Wallet } from 'lucide-react';
import { useWallet, shortenAddress } from '../contexts/WalletContext';
import { addressExplorerUrl } from '../lib/chain-config';

/**
 * Optional wallet connection control.
 *
 * Hidden entirely when no injected wallet exists, so users without MetaMask
 * are never shown a dead button — the relayer handles their registrations.
 */
export default function WalletButton() {
  const { address, isConnected, isCorrectNetwork, walletAvailable, connecting, connect, disconnect } =
    useWallet();

  if (!walletAvailable) return null;

  if (!isConnected) {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        title="Optional: sign your own registrations so the chain records you as owner"
        className="inline-flex items-center gap-2 rounded-[3px] border border-ink/20 px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-ink/50 hover:text-ink disabled:opacity-50"
      >
        <Wallet className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{connecting ? 'Connecting…' : 'Connect wallet'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {!isCorrectNetwork && (
        <span
          title="Switch your wallet to Sepolia to register artwork"
          className="rounded-[3px] bg-ochre-light px-2 py-1 text-xs text-ochre"
        >
          Switch to Sepolia
        </span>
      )}
      <a
        href={addressExplorerUrl(address!)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-[3px] border border-note/40 bg-note-light px-3 py-1.5 text-note hover:border-note"
        title="Your wallet on Etherscan"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-note" aria-hidden />
        <span className="font-mono text-[12.5px]">{shortenAddress(address!)}</span>
      </a>
      <button onClick={disconnect} className="hidden text-xs text-ink-faint hover:text-ink sm:inline" title="Forget this wallet">
        Disconnect
      </button>
    </div>
  );
}
