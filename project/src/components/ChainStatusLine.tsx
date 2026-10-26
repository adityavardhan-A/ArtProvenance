import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStatus, NODE_URL, type NodeStatus } from '../lib/artchain';

/**
 * Plain statement of the network's state, refreshed every few seconds.
 */
export default function ChainStatusLine() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      getStatus()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setOffline(false);
        })
        .catch(() => alive && setOffline(true));
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (offline) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
        <span className="inline-block h-2 w-2 rounded-full bg-seal" aria-hidden />
        No ArtChain node at {NODE_URL}. Run <code className="font-mono text-[12.5px] text-ink">npm start</code> in the
        server folder.
      </p>
    );
  }
  if (!status) return <p className="text-sm text-ink-faint">Connecting to ArtChain…</p>;

  const online = status.peers.filter((p) => p.online).length + 1;
  const total = status.peers.length + 1;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span className={`inline-block h-2 w-2 rounded-full ${online === total ? 'bg-note' : 'bg-ochre'}`} aria-hidden />
      <span>
        ArtChain is at{' '}
        <Link to={`/explorer/block/${status.height}`} className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
          block #{status.height}
        </Link>{' '}
        with {online} of {total} nodes online
        {status.mempool > 0 && `, ${status.mempool} transaction${status.mempool === 1 ? '' : 's'} waiting to be mined`}
        {status.mining.active && ' (mining now)'}.
      </span>
    </p>
  );
}
