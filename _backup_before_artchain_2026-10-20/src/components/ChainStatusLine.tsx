import { useEffect, useState, type ReactNode } from 'react';
import { getChainStatus, type ChainStatus } from '../lib/contract-interactions';
import { addressExplorerUrl } from '../lib/chain-config';

/**
 * Plain statement of whether the ledger is actually live. Shown under the
 * page title so nobody mistakes the in-memory fallback for the real chain.
 */
export default function ChainStatusLine() {
  const [status, setStatus] = useState<ChainStatus | null>(null);

  useEffect(() => {
    let alive = true;
    getChainStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  if (!status) {
    return <p className="text-sm text-ink-faint">Checking the ledger…</p>;
  }

  let tone: 'live' | 'partial' | 'off';
  let message: ReactNode;

  if (status.relayerAvailable && status.relayerSigning) {
    tone = 'live';
    message =
      status.totalRegistered !== null
        ? `${status.totalRegistered.toLocaleString()} ${status.totalRegistered === 1 ? 'work' : 'works'} recorded on Sepolia`
        : 'Connected to Sepolia';
  } else if (status.relayerAvailable && status.contractAddress) {
    tone = 'partial';
    message = 'Relayer has no signing key, so new works can only be recorded from a connected wallet';
  } else if (status.relayerAvailable) {
    tone = 'off';
    message = 'Contract not deployed yet. Registrations are held in the relayer’s memory and lost on restart';
  } else if (status.configured) {
    tone = 'partial';
    message = 'Relayer offline. Verification reads Sepolia directly; registering needs a wallet';
  } else {
    tone = 'off';
    message = 'Ledger not connected. Start the relayer and set the contract address in .env';
  }

  const dot = tone === 'live' ? 'bg-note' : tone === 'partial' ? 'bg-ochre' : 'bg-seal';

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <span>{message}</span>
      {status.contractAddress && (
        <a
          href={addressExplorerUrl(status.contractAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="machine underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
          title="View the registry contract on Etherscan"
        >
          {status.contractAddress.slice(0, 8)}…{status.contractAddress.slice(-6)}
        </a>
      )}
    </p>
  );
}
