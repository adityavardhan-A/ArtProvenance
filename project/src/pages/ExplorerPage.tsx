import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import VerifyInBrowser from '../components/VerifyInBrowser';
import {
  addressOf,
  blockHashOf,
  displayName,
  fileUrl,
  getAccount,
  getBlock,
  getBlocks,
  getMempool,
  getStatus,
  getTx,
  mineNow,
  sha256Hex,
  short,
  tamperDemo,
  timeAgo,
  txIdOf,
  validateChain,
  verifyTxSignature,
  TX_LABELS,
  type Account,
  type Block,
  type BlockSummary,
  type ChainTx,
  type NodeStatus,
  type TamperReport,
  type TxLookup,
  type ValidationReport,
} from '../lib/artchain';

type View = 'overview' | 'block' | 'tx' | 'address';

export default function ExplorerPage({ view }: { view: View }) {
  const params = useParams();
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        {view !== 'overview' && (
          <Link to="/explorer" className="text-sm text-ink-soft hover:text-ink">
            ArtChain explorer
          </Link>
        )}
        {view === 'overview' && <Overview />}
        {view === 'block' && <BlockView id={params.id!} />}
        {view === 'tx' && <TxView id={params.id!} />}
        {view === 'address' && <AddressView address={params.address!} />}
      </main>
    </div>
  );
}

// ================================================================ shared bits

/** A block hash with its proof-of-work zeros picked out. */
function PowHash({ hash, difficulty, length }: { hash: string; difficulty: number; length?: number }) {
  const zeros = hash.match(/^0*/)?.[0].length ?? 0;
  const lead = Math.min(zeros, Math.max(difficulty, 0));
  const shown = length ? hash.slice(0, length) : hash;
  return (
    <span className="font-mono tracking-tight" title={hash}>
      <span className="font-medium text-note">{shown.slice(0, lead)}</span>
      <span>{shown.slice(lead)}</span>
      {length && hash.length > length ? '…' : ''}
    </span>
  );
}

function describeTx(tx: ChainTx): string {
  const p = tx.payload;
  switch (tx.type) {
    case 'IDENTITY':
      return `Published the name “${p.name}”`;
    case 'REGISTER':
      return `Registered “${p.title}”`;
    case 'TRANSFER':
      return `Transferred ${short(p.fileHash, 8)} to ${short(p.to, 10)}`;
    case 'REPORT':
      return `Reported ${short(p.suspectHash, 8)} as a copy of ${short(p.originalHash, 8)}`;
  }
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="space-y-3 text-[14px]">{children}</dl>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Check2({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 text-[13.5px]">
      <span className={`mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-paper-mat ${ok ? 'bg-note' : 'bg-seal'}`}>
        {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </li>
  );
}

function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await fn());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
    if (!ms) return;
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms]);
  return { data, error, reload: load };
}

// =================================================================== overview

function Overview() {
  const status = usePoll<NodeStatus>(getStatus, 3000);
  const blocks = usePoll(() => getBlocks(undefined, 30), 3000);
  const mempool = usePoll(getMempool, 3000);
  const [mining, setMining] = useState('');

  const s = status.data;

  const mine = async () => {
    setMining('Mining…');
    try {
      const r = await mineNow();
      setMining(r.mined ? `Mined block #${r.block!.index} after ${r.stats!.attempts.toLocaleString()} hashes in ${r.stats!.ms} ms.` : r.reason || '');
      blocks.reload();
      mempool.reload();
    } catch (e) {
      setMining(e instanceof Error ? e.message : 'Mining failed');
    }
  };

  if (status.error && !s) {
    return (
      <div className="max-w-2xl py-12">
        <h1 className="text-[44px] leading-tight">ArtChain explorer</h1>
        <p className="mt-4 text-ink-soft">{status.error}</p>
      </div>
    );
  }
  if (!s) return <LoadingSpinner fullScreen={false} />;

  const recent = blocks.data?.blocks ?? [];
  const strip = recent.slice(0, 8).reverse();

  return (
    <>
      <header className="max-w-3xl">
        <h1 className="text-[44px] leading-[1.02] sm:text-[56px]">ArtChain explorer</h1>
        <p className="mt-3 max-w-[62ch] text-[17px] text-ink-soft">
          A proof-of-work blockchain run by {s.peers.length + 1} nodes on this machine. Every block below was mined, every
          transaction signed by an artist’s own key, and every node checks both independently.
        </p>
      </header>

      {/* The chain itself */}
      <section className="mt-10" aria-label="Latest blocks">
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <ol className="flex min-w-max items-stretch">
            {strip.map((b, i) => (
              <li key={b.hash} className="flex items-stretch">
                {i > 0 && (
                  <div className="flex w-10 flex-col items-center justify-center" aria-hidden>
                    <div className="h-px w-full bg-ink/40" />
                  </div>
                )}
                <Link
                  to={`/explorer/block/${b.index}`}
                  className={`block w-[188px] rounded-[3px] border bg-paper-mat p-3.5 transition-colors hover:border-ink ${
                    b.index === s.height ? 'border-ink/70' : 'border-ink/20'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-2xl">#{b.index}</span>
                    <span className="text-[12px] text-ink-faint">{b.index === 0 ? 'genesis' : timeAgo(b.timestamp)}</span>
                  </div>
                  <div className="mt-2 text-[12px]">
                    <PowHash hash={b.hash} difficulty={b.difficulty} length={16} />
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-ink-faint">prev {b.previousHash.slice(0, 10)}…</div>
                  <div className="mt-2 text-[12.5px] text-ink-soft">
                    {b.txCount === 0 ? 'no transactions' : `${b.txCount} tx: ${[...new Set(b.types)].map((t) => TX_LABELS[t].toLowerCase()).join(', ')}`}
                  </div>
                </Link>
              </li>
            ))}
            {s.mempool > 0 && (
              <li className="flex items-stretch">
                <div className="flex w-10 items-center" aria-hidden>
                  <div className="h-px w-full border-t border-dashed border-ink/40" />
                </div>
                <div className="flex w-[188px] flex-col justify-between rounded-[3px] border border-dashed border-ochre/60 p-3.5 text-ochre">
                  <span className="font-display text-2xl">#{s.height + 1}</span>
                  <span className="text-[12.5px]">
                    {s.mining.active ? `Mining: ${s.mining.progress.toLocaleString()} hashes tried` : `${s.mempool} tx waiting to be mined`}
                  </span>
                </div>
              </li>
            )}
          </ol>
        </div>
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-12">
          <section className="min-w-0">
            <h2 className="text-2xl">Blocks</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13.5px]">
                <thead className="border-b border-ink/20 text-ink-soft">
                  <tr>
                    <th className="py-2 pr-4 font-normal">Height</th>
                    <th className="py-2 pr-4 font-normal">Hash</th>
                    <th className="py-2 pr-4 font-normal">Transactions</th>
                    <th className="py-2 pr-4 font-normal">Nonce</th>
                    <th className="py-2 font-normal">Mined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {recent.map((b: BlockSummary) => (
                    <tr key={b.hash}>
                      <td className="py-2.5 pr-4">
                        <Link to={`/explorer/block/${b.index}`} className="font-display text-[17px] underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                          #{b.index}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-[12.5px]"><PowHash hash={b.hash} difficulty={b.difficulty} length={20} /></td>
                      <td className="py-2.5 pr-4">{b.txCount}</td>
                      <td className="py-2.5 pr-4 font-mono text-[12.5px]">{b.nonce.toLocaleString()}</td>
                      <td className="py-2.5 text-ink-soft">{b.index === 0 ? 'genesis' : timeAgo(b.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <IntegrityLab height={s.height} />
        </div>

        <aside className="min-w-0 space-y-12">
          <section className="min-w-0">
            <h2 className="text-2xl">Network</h2>
            <Fields>
              <div className="mt-4" />
              <Field label="Height">#{s.height}</Field>
              <Field label="Difficulty">{s.difficulty} leading zeros, about {(16 ** s.difficulty).toLocaleString()} hashes per block</Field>
              <Field label="Total work">{s.cumulativeWork.toLocaleString()} expected hashes</Field>
              <Field label="On chain">
                {s.artworks} artwork{s.artworks === 1 ? '' : 's'}, {s.identities} artist{s.identities === 1 ? '' : 's'}, {s.transactions} transaction{s.transactions === 1 ? '' : 's'}
              </Field>
              {s.mining.hashRate && <Field label="Hash rate">{s.mining.hashRate.toLocaleString()} hashes/s on {s.node.name}</Field>}
              <Field label="Genesis"><span className="machine">{s.genesisHash}</span></Field>
            </Fields>

            <h3 className="mt-8 text-lg">Nodes</h3>
            <ul className="mt-3 divide-y divide-ink/10 border-y border-ink/10 text-[13.5px]">
              <li className="flex items-center gap-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-note" aria-hidden />
                <span className="font-medium">{s.node.name}</span>
                <span className="text-ink-faint">this node, {s.node.url.replace('http://', '')}</span>
                <span className="ml-auto font-mono text-[12px]">#{s.height}</span>
              </li>
              {s.peers.map((p) => (
                <li key={p.url} className="flex items-center gap-3 py-2.5">
                  <span className={`h-2 w-2 rounded-full ${p.online ? (p.height === s.height ? 'bg-note' : 'bg-ochre') : 'bg-seal'}`} aria-hidden />
                  <span className="font-medium">{p.name || 'peer'}</span>
                  <span className="text-ink-faint">{p.url.replace('http://', '')}</span>
                  <span className="ml-auto font-mono text-[12px]">{p.online ? `#${p.height}` : 'offline'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-2xl">Mempool</h2>
              <button onClick={mine} disabled={!mempool.data?.size || s.mining.active} className="btn-link">
                Mine now
              </button>
            </div>
            {mining && <p className="mt-2 text-[13px] text-ink-soft">{mining}</p>}
            {!mempool.data?.size ? (
              <p className="mt-3 text-[14px] text-ink-soft">Empty. Nodes mine automatically a second or two after a transaction arrives.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-[13.5px]">
                {mempool.data.transactions.map((t) => (
                  <li key={t.id}>
                    <Link to={`/explorer/tx/${t.id}`} className="underline decoration-ink/20 underline-offset-4">{describeTx(t)}</Link>{' '}
                    <span className="text-ink-faint">{timeAgo(t.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

// ============================================================ integrity lab

function IntegrityLab({ height }: { height: number }) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [tamper, setTamper] = useState<TamperReport | null>(null);
  const [tampering, setTampering] = useState(false);
  const [target, setTarget] = useState('');

  const runValidate = async () => {
    setChecking(true);
    try {
      setReport(await validateChain());
    } finally {
      setChecking(false);
    }
  };

  const runTamper = async () => {
    setTampering(true);
    try {
      setTamper(await tamperDemo(target ? Number(target) : undefined));
    } finally {
      setTampering(false);
    }
  };

  const total = height + 1;

  return (
    <section className="min-w-0">
      <h2 className="text-2xl">Integrity</h2>
      <p className="mt-2 max-w-prose text-[14.5px] text-ink-soft">
        Re-run every consensus check over the whole chain, or watch what happens when someone tries to rewrite history.
      </p>

      <div className="mt-5 rounded-md border border-ink/15 bg-paper-mat p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg">Validate the whole chain</h3>
          <button onClick={runValidate} disabled={checking} className="btn-secondary py-2">
            {checking ? 'Checking…' : 'Run all checks'}
          </button>
        </div>
        {report && (
          <div className="mt-4 animate-rise">
            <p className={report.valid ? 'text-note' : 'text-seal'}>
              {report.valid
                ? `Valid. All ${report.counts.blocks} blocks pass: hash links, block hashes, proof-of-work, Merkle roots, ${report.counts.transactions} signatures and every registry rule.`
                : `Invalid from block #${report.firstInvalid}.`}
            </p>
            <BlockGrid statuses={report.blocks.map((b) => b.ok)} />
            {!report.valid &&
              report.blocks
                .filter((b) => !b.ok)
                .slice(0, 3)
                .map((b) => (
                  <p key={b.index} className="mt-2 text-[13px] text-seal">
                    #{b.index}: {b.problems.join(' ')}
                  </p>
                ))}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-md border border-seal/25 bg-paper-mat p-5">
        <h3 className="text-lg">Tamper test</h3>
        <p className="mt-1 text-[14px] text-ink-soft">
          Forges a copy of the chain in three escalating ways and validates each. The real chain is never touched.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="tamper-target" className="field-label">Block to forge</label>
            <input
              id="tamper-target"
              type="number"
              min={1}
              max={height}
              value={target}
              placeholder="latest"
              onChange={(e) => setTarget(e.target.value)}
              className="field-boxed w-28 py-2"
            />
          </div>
          <button onClick={runTamper} disabled={tampering || height < 1} className="btn-danger py-2.5">
            {tampering ? 'Forging…' : 'Try to rewrite history'}
          </button>
        </div>

        {tamper?.error && <p className="mt-4 text-[14px] text-ink-soft">{tamper.error}</p>}
        {tamper && !tamper.error && (
          <div className="mt-6 animate-rise space-y-6">
            <p className="text-[14px]">
              Target: block #{tamper.target.index}, a {TX_LABELS[tamper.target.type].toLowerCase()} — changing{' '}
              <b className="font-medium">{tamper.edit.field === 'to' ? 'recipient' : tamper.edit.field}</b> from “{short(tamper.edit.before, 40)}” to “{short(tamper.edit.after, 40)}”.
            </p>
            <ol className="space-y-5">
              {tamper.scenarios.map((sc, i) => (
                <li key={sc.key} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                  <span className="font-display text-2xl leading-none text-ink-faint">{i + 1}</span>
                  <div>
                    <p className="font-medium">{sc.title}</p>
                    <p className="mt-0.5 text-[13.5px] text-ink-soft">{sc.what}</p>
                    <BlockGrid statuses={Array.from({ length: total }, (_, k) => !sc.result.brokenBlocks.includes(k))} />
                    <p className={`mt-2 text-[13.5px] ${sc.result.valid ? 'text-note' : 'text-seal'}`}>
                      {sc.result.valid ? 'Accepted (this should never happen).' : `Every node rejects it at block #${sc.result.firstInvalid}: ${sc.result.problems[0]?.problems[0] ?? ''}`}
                    </p>
                    {sc.note && <p className="mt-1 text-[13px] text-ink-soft">{sc.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-[13.5px] text-note">The real chain is still valid: {tamper.realChainValid ? 'yes' : 'no'}.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function BlockGrid({ statuses }: { statuses: boolean[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1" aria-label="Block status, oldest first">
      {statuses.map((ok, i) => (
        <span
          key={i}
          title={`Block #${i}: ${ok ? 'valid' : 'invalid'}`}
          className={`flex h-6 min-w-[24px] items-center justify-center rounded-[2px] px-1 font-mono text-[10px] ${ok ? 'bg-note-light text-note' : 'bg-seal text-paper-mat'}`}
        >
          {i}
        </span>
      ))}
    </div>
  );
}

// ===================================================================== block

function BlockView({ id }: { id: string }) {
  const [block, setBlock] = useState<Block | null>(null);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<{ label: string; ok: boolean; detail: string }[] | null>(null);

  useEffect(() => {
    setBlock(null);
    setChecks(null);
    getBlock(id).then(setBlock).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="mt-8 text-ink-soft">{error}</p>;
  if (!block) return <LoadingSpinner fullScreen={false} />;

  const recheck = async () => {
    const out = [];
    const hash = await blockHashOf(block);
    out.push({ label: 'Block hash', ok: hash === block.hash, detail: `SHA-256 of the header is ${short(hash, 16)}.` });
    if (block.index > 0) {
      out.push({
        label: 'Proof-of-work',
        ok: hash.startsWith('0'.repeat(block.difficulty)),
        detail: `Starts with ${block.difficulty} zeros, found at nonce ${block.nonce.toLocaleString()}.`,
      });
    }
    let level = block.transactions.map((t) => t.id);
    if (!level.length) level = [await sha256Hex('')];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) next.push(await sha256Hex(level[i] + (level[i + 1] ?? level[i])));
      level = next;
    }
    out.push({ label: 'Merkle root', ok: level[0] === block.merkleRoot, detail: `Rebuilt from ${block.transactions.length} transaction id${block.transactions.length === 1 ? '' : 's'}: ${short(level[0], 16)}.` });
    let sigs = 0;
    for (const t of block.transactions) if ((await verifyTxSignature(t)) && (await txIdOf(t)) === t.id) sigs++;
    out.push({ label: 'Signatures', ok: sigs === block.transactions.length, detail: `${sigs} of ${block.transactions.length} transactions carry a valid ECDSA signature over their own id.` });
    if (block.index > 0) {
      const prev = await getBlock(block.index - 1);
      out.push({ label: 'Link to parent', ok: (await blockHashOf(prev)) === block.previousHash, detail: `previousHash equals block #${prev.index}'s recomputed hash.` });
    }
    setChecks(out);
  };

  return (
    <>
      <h1 className="mt-3 text-[44px] leading-tight">Block #{block.index}</h1>
      <p className="mt-2 text-ink-soft">
        {block.index === 0 ? 'The genesis block, identical on every node.' : `Mined ${timeAgo(block.timestamp)}, ${block.confirmations} confirmation${block.confirmations === 1 ? '' : 's'} deep.`}
      </p>
      <div className="mt-4 flex gap-5 text-sm">
        {block.index > 0 && <Link to={`/explorer/block/${block.index - 1}`} className="btn-link">Previous block</Link>}
        {block.confirmations > 1 && <Link to={`/explorer/block/${block.index + 1}`} className="btn-link">Next block</Link>}
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="text-2xl">Header</h2>
          <p className="mt-1 text-[13.5px] text-ink-soft">These seven fields are all that get hashed. Change any one and the block hash changes.</p>
          <div className="mt-5">
            <Fields>
              <Field label="Hash"><span className="text-[13px]"><PowHash hash={block.hash} difficulty={block.difficulty} /></span></Field>
              <Field label="Index">{block.index}</Field>
              <Field label="Timestamp">{new Date(block.timestamp).toLocaleString('en-GB')} <span className="machine">({block.timestamp})</span></Field>
              <Field label="Previous hash">
                {block.index > 0 ? (
                  <Link to={`/explorer/block/${block.index - 1}`} className="machine underline decoration-ink/20 underline-offset-4">{block.previousHash}</Link>
                ) : (
                  <span className="machine">{block.previousHash}</span>
                )}
              </Field>
              <Field label="Merkle root"><span className="machine">{block.merkleRoot}</span></Field>
              <Field label="Difficulty">{block.difficulty}</Field>
              <Field label="Nonce"><span className="font-mono">{block.nonce.toLocaleString()}</span></Field>
              <Field label="Miner">
                {/^ac[0-9a-f]{40}$/.test(block.miner) ? <span className="machine">{block.miner}</span> : <span className="italic text-ink-soft">“{block.miner}”</span>}
              </Field>
            </Fields>
          </div>

          <div className="mt-8">
            <button onClick={recheck} className="btn-primary">Recompute this block in my browser</button>
            {checks && (
              <ol className="mt-4 space-y-2.5">
                {checks.map((c) => (
                  <Check2 key={c.label} ok={c.ok}>
                    <span className="font-medium">{c.label}.</span> <span className="text-ink-soft">{c.detail}</span>
                  </Check2>
                ))}
              </ol>
            )}
          </div>

          <h2 className="mt-12 text-2xl">Transactions <span className="text-ink-faint">{block.transactions.length}</span></h2>
          {block.transactions.length === 0 ? (
            <p className="mt-3 text-ink-soft">None.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
              {block.transactions.map((t) => (
                <li key={t.id} className="grid gap-1 py-3 text-[14px] sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
                  <span className="text-ink-soft">{TX_LABELS[t.type]}</span>
                  <span className="min-w-0">
                    <Link to={`/explorer/tx/${t.id}`} className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">{describeTx(t)}</Link>
                    <span className="machine block">{t.id}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="text-2xl">Merkle tree</h2>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Transaction ids at the bottom, hashed in pairs up to the root stored in the header. An odd one out is paired with itself.
          </p>
          <div className="mt-5 space-y-3">
            {[...block.merkleLevels].reverse().map((level, i, all) => (
              <div key={i}>
                <p className="mb-1 text-[12px] text-ink-faint">
                  {i === 0 ? 'Root' : i === all.length - 1 ? 'Transactions' : `Level ${all.length - 1 - i}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {level.map((h, j) => (
                    <span
                      key={j}
                      title={h}
                      className={`rounded-[2px] px-1.5 py-0.5 font-mono text-[11px] ${i === 0 ? 'bg-ink text-paper-mat' : 'bg-paper-deep text-ink-soft'}`}
                    >
                      {h.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

// ======================================================================== tx

function TxView({ id }: { id: string }) {
  const { data, error } = usePoll<TxLookup>(() => getTx(id), 2500, [id]);
  const [sig, setSig] = useState<{ id: boolean; sig: boolean; addr: boolean } | null>(null);

  if (error && !data) return <p className="mt-8 text-ink-soft">{error}</p>;
  if (!data) return <LoadingSpinner fullScreen={false} />;
  const { tx } = data;

  const checkSig = async () => {
    setSig({ id: (await txIdOf(tx)) === tx.id, sig: await verifyTxSignature(tx), addr: (await addressOf(tx.publicKey)) === tx.from });
  };

  return (
    <>
      <h1 className="mt-3 text-[40px] leading-tight">{TX_LABELS[tx.type]}</h1>
      <p className="mt-2 text-[17px]">{describeTx(tx)}</p>
      <p className={`mt-2 text-sm ${data.status === 'confirmed' ? 'text-note' : 'text-ochre'}`}>
        {data.status === 'confirmed' ? (
          <>
            Confirmed in <Link to={`/explorer/block/${data.blockIndex}`} className="underline underline-offset-4">block #{data.blockIndex}</Link>,{' '}
            {data.confirmations} confirmation{data.confirmations === 1 ? '' : 's'}
          </>
        ) : (
          'In the mempool, waiting for a node to mine it'
        )}
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <Fields>
            <Field label="Transaction id"><span className="machine">{tx.id}</span></Field>
            <Field label="Signed by">
              <Link to={`/explorer/address/${tx.from}`} className="machine underline decoration-ink/20 underline-offset-4">{tx.from}</Link>
            </Field>
            <Field label="Signed at">{new Date(tx.timestamp).toLocaleString('en-GB')}</Field>
            {Object.entries(tx.payload).map(([k, v]) => (
              <Field key={k} label={k}>
                {k === 'to' ? (
                  <Link to={`/explorer/address/${v}`} className="machine underline decoration-ink/20 underline-offset-4">{String(v)}</Link>
                ) : /hash/i.test(k) ? (
                  <span className="machine">{String(v)}</span>
                ) : (
                  String(v)
                )}
              </Field>
            ))}
            <Field label="Public key"><span className="machine">{tx.publicKey}</span></Field>
            <Field label="Signature"><span className="machine">{tx.signature}</span></Field>
          </Fields>
        </section>

        <section className="min-w-0 space-y-10">
          {tx.type === 'REGISTER' && (
            <div className="framed max-w-xs">
              <img src={fileUrl(tx.payload.fileHash)} alt={tx.payload.title} className="w-full" />
            </div>
          )}
          <div>
            <h2 className="text-xl">Check the signature</h2>
            <p className="mt-1 text-[13.5px] text-ink-soft">Uses your browser’s own WebCrypto, not the node.</p>
            <button onClick={checkSig} className="btn-secondary mt-4">Verify signature</button>
            {sig && (
              <ol className="mt-4 space-y-2.5">
                <Check2 ok={sig.id}>The id is the SHA-256 of the transaction’s contents.</Check2>
                <Check2 ok={sig.sig}>The ECDSA signature over that id matches the public key.</Check2>
                <Check2 ok={sig.addr}>The public key hashes to the sender’s address.</Check2>
              </ol>
            )}
          </div>
          {data.status === 'confirmed' && (
            <div>
              <h2 className="text-xl">Check it’s in the chain</h2>
              <p className="mt-1 mb-4 text-[13.5px] text-ink-soft">Follows the Merkle proof to the block header, then checks the block’s hash, work and link.</p>
              <VerifyInBrowser txId={tx.id} label="Verify inclusion" />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// =================================================================== address

function AddressView({ address }: { address: string }) {
  const { data, error } = usePoll<Account>(() => getAccount(address), 5000, [address]);
  if (error && !data) return <p className="mt-8 text-ink-soft">{error}</p>;
  if (!data) return <LoadingSpinner fullScreen={false} />;

  const all = [...data.pending, ...data.transactions];

  return (
    <>
      <h1 className="mt-3 text-[40px] leading-tight">{data.name || 'Unnamed address'}</h1>
      <p className="machine mt-2">{address}</p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="text-2xl">Owns <span className="text-ink-faint">{data.owned.length}</span></h2>
          {data.owned.length === 0 ? (
            <p className="mt-3 text-ink-soft">No works.</p>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3">
              {data.owned.map((a) => (
                <Link key={a.fileHash} to={`/explorer/tx/${a.txId}`} className="group">
                  <div className="framed"><img src={fileUrl(a.fileHash)} alt={a.title} className="aspect-square w-full object-cover" /></div>
                  <p className="mt-2 font-display text-[17px] leading-tight group-hover:underline">{a.title}</p>
                  <p className="text-[12.5px] text-ink-faint">
                    {a.creator === address ? 'Created' : `By ${displayName(a.creatorName, a.creator)}`}, block #{a.block}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="text-2xl">Activity <span className="text-ink-faint">{all.length}</span></h2>
          <ul className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
            {all.map((t) => (
              <li key={t.tx.id} className="py-3 text-[14px]">
                <Link to={`/explorer/tx/${t.tx.id}`} className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                  {t.tx.from === address ? describeTx(t.tx) : `Received ${short(t.tx.payload.fileHash, 8)} from ${short(t.tx.from, 10)}`}
                </Link>
                <span className="block text-[12.5px] text-ink-faint">
                  {t.status === 'pending' ? 'Pending' : `Block #${t.blockIndex}`}, {timeAgo(t.tx.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
