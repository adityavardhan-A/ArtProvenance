import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { getTx, verifyInclusion, type ProofCheck } from '../lib/artchain';

/**
 * Re-derives a registration's proof in this browser: signature, Merkle path,
 * block hash, proof-of-work and chain link. Nothing is taken from the node on
 * trust except the raw data being checked.
 */
export default function VerifyInBrowser({ txId, label = 'Verify in this browser' }: { txId: string; label?: string }) {
  const [checks, setChecks] = useState<ProofCheck[] | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setRunning(true);
    setError('');
    setChecks(null);
    try {
      const { tx } = await getTx(txId);
      const result = await verifyInclusion(tx);
      setPath(result.path);
      setChecks(result.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setRunning(false);
    }
  };

  const allOk = checks?.every((c) => c.ok);

  return (
    <div>
      <button onClick={run} disabled={running} className="btn-primary">
        {running ? 'Recomputing hashes…' : label}
      </button>
      {error && <p className="mt-3 text-sm text-seal">{error}</p>}
      {checks && (
        <div className="mt-5 animate-rise">
          <p className={`font-display text-xl ${allOk ? 'text-note' : 'text-seal'}`}>
            {allOk ? 'Every check passed in your browser' : 'This record failed verification'}
          </p>
          <ol className="mt-3 space-y-2.5">
            {checks.map((c) => (
              <li key={c.label} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 text-[13.5px]">
                <span
                  className={`mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ${c.ok ? 'bg-note text-paper-mat' : 'bg-seal text-paper-mat'}`}
                  aria-label={c.ok ? 'passed' : 'failed'}
                >
                  {c.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span>
                  <span className="font-medium text-ink">{c.label}.</span> <span className="text-ink-soft">{c.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          {path.length > 1 && (
            <details className="mt-4 text-[12.5px] text-ink-soft">
              <summary className="cursor-pointer select-none hover:text-ink">Show the Merkle path</summary>
              <ol className="mt-2 space-y-1 border-l border-ink/20 pl-3">
                {path.map((h, i) => (
                  <li key={i} className="machine">
                    {i === 0 ? 'leaf ' : i === path.length - 1 ? 'root ' : `level ${i} `}
                    {h}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
