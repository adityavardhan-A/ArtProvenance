import { ExternalLink } from 'lucide-react';
import Rosette from './Rosette';
import { txExplorerUrl } from '../lib/chain-config';
import type { ChainStatusValue } from '../lib/supabase';

/**
 * One-line statement of what the database says about an artwork's chain
 * registration. Never claims "on chain" without a confirmed status.
 */
export default function ChainSeal({
  status,
  blockNumber,
  txHash,
  compact = false,
}: {
  status: ChainStatusValue | null | undefined;
  blockNumber?: number | null;
  txHash?: string | null;
  compact?: boolean;
}) {
  if (status === 'confirmed') {
    return (
      <div className="flex items-center gap-2 text-[13px] text-note">
        <Rosette detail="mark" size={compact ? 16 : 18} strokeWidth={4} />
        <span>
          Recorded on Sepolia
          {blockNumber ? (
            <>
              {' '}in block <span className="font-mono text-[12px]">{blockNumber}</span>
            </>
          ) : null}
        </span>
        {txHash && !compact && (
          <a
            href={txExplorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-note underline decoration-note/30 underline-offset-4 hover:decoration-note"
          >
            Etherscan
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[13px] text-ochre">
      <span
        className="inline-block h-[14px] w-[14px] rounded-full border border-dashed border-current"
        aria-hidden
      />
      <span>{status === 'failed' ? 'Ledger registration failed' : 'Waiting to be recorded on chain'}</span>
    </div>
  );
}
