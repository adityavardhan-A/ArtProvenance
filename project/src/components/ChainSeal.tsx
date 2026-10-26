import { Link } from 'react-router-dom';
import Rosette from './Rosette';

/**
 * One line stating where an artwork sits on the chain. Rendered only from
 * chain data, so "sealed" always means mined into a block.
 */
export default function ChainSeal({
  block,
  confirmations,
  compact = false,
}: {
  block: number | null | undefined;
  confirmations?: number;
  compact?: boolean;
}) {
  if (block === null || block === undefined) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ochre">
        <span className="inline-block h-[14px] w-[14px] rounded-full border border-dashed border-current" aria-hidden />
        <span>In the mempool, waiting to be mined</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[13px] text-note">
      <Rosette detail="mark" size={compact ? 16 : 18} strokeWidth={4} />
      <span>
        Sealed in{' '}
        <Link to={`/explorer/block/${block}`} className="underline decoration-note/30 underline-offset-4 hover:decoration-note">
          block #{block}
        </Link>
        {!compact && confirmations !== undefined && (
          <span className="text-ink-faint">
            {' '}
            with {confirmations} confirmation{confirmations === 1 ? '' : 's'}
          </span>
        )}
      </span>
    </div>
  );
}
