import { useEffect, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { ChainError, getIdentities, shortAddress, type Artwork, type TxLookup } from '../lib/artchain';

/**
 * Sign a TRANSFER handing ownership to another address. The registry rules
 * on every node check that the signer really is the current owner.
 */
export default function TransferDialog({
  artwork,
  onClose,
  onDone,
}: {
  artwork: Artwork | null;
  onClose: () => void;
  onDone: (block: number) => void;
}) {
  const { address, sendAndConfirm } = useWallet();
  const [people, setPeople] = useState<{ address: string; name: string }[]>([]);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<'idle' | 'signing' | 'pending' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!artwork) return;
    setTo('');
    setNote('');
    setPhase('idle');
    setError('');
    getIdentities()
      .then(({ identities }) => setPeople(identities.filter((i) => i.address !== address)))
      .catch(() => setPeople([]));
  }, [artwork, address]);

  if (!artwork) return null;

  const valid = /^ac[0-9a-f]{40}$/.test(to.trim());

  const submit = async () => {
    setPhase('signing');
    setError('');
    try {
      const confirmed = await sendAndConfirm(
        'TRANSFER',
        { fileHash: artwork.fileHash, to: to.trim(), ...(note.trim() ? { note: note.trim() } : {}) },
        (t: TxLookup) => t.status === 'pending' && setPhase('pending')
      );
      onDone(confirmed.blockIndex!);
    } catch (e) {
      setPhase('error');
      setError(e instanceof ChainError || e instanceof Error ? e.message : 'Transfer failed.');
    }
  };

  const busy = phase === 'signing' || phase === 'pending';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-lg animate-rise rounded-md border border-ink/15 bg-paper-mat p-7 shadow-2xl">
        <h3 id="transfer-title" className="text-[28px] leading-tight">
          Transfer “{artwork.title}”
        </h3>
        <p className="mt-2 text-[14.5px] text-ink-soft">
          You sign a transfer with your private key. Once it is mined, the new owner is recorded on every node and you
          can no longer transfer it yourself.
        </p>

        <div className="mt-6 space-y-5">
          {people.length > 0 && (
            <div>
              <label htmlFor="pick" className="field-label">Choose an artist on ArtChain</label>
              <select
                id="pick"
                className="field-boxed"
                value={people.some((p) => p.address === to) ? to : ''}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy}
              >
                <option value="">Select…</option>
                {people.map((p) => (
                  <option key={p.address} value={p.address}>
                    {p.name} ({shortAddress(p.address)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="to" className="field-label">{people.length ? 'Or paste an address' : 'Recipient address'}</label>
            <input
              id="to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={busy}
              placeholder="ac…"
              className="field font-mono text-[13.5px]"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="note" className="field-label">Note on the record <span className="text-ink-faint">(optional, public)</span></label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} maxLength={200} className="field" placeholder="Sold at the March show" />
          </div>
        </div>

        {phase === 'pending' && (
          <p className="mt-5 text-sm text-ink-soft" role="status">Signed and broadcast. Waiting for a node to mine it into a block…</p>
        )}
        {phase === 'error' && <p className="mt-5 text-sm text-seal" role="alert">{error}</p>}

        <div className="mt-7 flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={!valid || busy || to.trim() === address} className="btn-primary">
            {phase === 'signing' ? 'Signing…' : phase === 'pending' ? 'Mining…' : 'Sign and transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
