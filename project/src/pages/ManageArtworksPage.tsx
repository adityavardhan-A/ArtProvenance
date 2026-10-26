import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { displayName, fileUrl, getAccount, type Account, type Artwork } from '../lib/artchain';
import Navbar from '../components/Navbar';
import Alert from '../components/Alert';
import ChainSeal from '../components/ChainSeal';
import LoadingSpinner from '../components/LoadingSpinner';
import TransferDialog from '../components/TransferDialog';
import ImagePreviewModal from '../components/ImagePreviewModal';

/** Works this wallet owns or created, straight from the chain. */
export default function ManageArtworksPage() {
  const { address } = useWallet();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [transfer, setTransfer] = useState<Artwork | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      setAccount(await getAccount(address));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach ArtChain.');
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const owned = account?.owned ?? [];
  const passedOn = (account?.created ?? []).filter((a) => a.owner !== address);

  return (
    <div className="min-h-screen">
      <Navbar />
      <TransferDialog
        artwork={transfer}
        onClose={() => setTransfer(null)}
        onDone={(block) => {
          setMessage(`“${transfer?.title}” transferred in block #${block}.`);
          setTransfer(null);
          load();
        }}
      />
      <ImagePreviewModal fileHash={open} onClose={() => setOpen(null)} onChanged={load} />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <h1 className="text-[44px] leading-[1.02] sm:text-[52px]">My works</h1>
        <p className="mt-3 max-w-[62ch] text-[17px] text-ink-soft">
          Everything here is read from the chain for wallet{' '}
          <Link to={`/explorer/address/${address}`} className="font-mono text-[14px] text-ink underline decoration-ink/20 underline-offset-4">
            {address}
          </Link>
          . Records can’t be edited or deleted; you can only transfer what you own.
        </p>

        {message && (
          <div className="mt-6">
            <Alert type="success" message={message} onClose={() => setMessage('')} />
          </div>
        )}
        {error && (
          <div className="mt-6">
            <Alert type="error" message={error} />
          </div>
        )}

        {!account && !error ? (
          <LoadingSpinner fullScreen={false} />
        ) : account && owned.length === 0 && passedOn.length === 0 ? (
          <div className="py-20">
            <h2 className="text-3xl">Nothing on the chain yet</h2>
            <p className="mt-2 text-ink-soft">Works you register from the collection page will appear here once mined.</p>
          </div>
        ) : (
          <>
            {owned.length > 0 && (
              <section className="mt-10">
                <h2 className="text-2xl">Owned by you <span className="text-ink-faint">{owned.length}</span></h2>
                <ul className="mt-4 divide-y divide-ink/15 border-y border-ink/15">
                  {owned.map((art) => (
                    <WorkRow key={art.fileHash} art={art} onOpen={() => setOpen(art.fileHash)}>
                      <button onClick={() => setTransfer(art)} className="btn-secondary py-2">Transfer ownership</button>
                    </WorkRow>
                  ))}
                </ul>
              </section>
            )}

            {passedOn.length > 0 && (
              <section className="mt-14">
                <h2 className="text-2xl">Created by you, now owned by others <span className="text-ink-faint">{passedOn.length}</span></h2>
                <ul className="mt-4 divide-y divide-ink/15 border-y border-ink/15">
                  {passedOn.map((art) => (
                    <WorkRow key={art.fileHash} art={art} onOpen={() => setOpen(art.fileHash)}>
                      <span className="text-sm text-ink-soft">Owner: {displayName(art.ownerName, art.owner)}</span>
                    </WorkRow>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function WorkRow({ art, onOpen, children }: { art: Artwork; onOpen: () => void; children: React.ReactNode }) {
  return (
    <li className="grid gap-6 py-8 sm:grid-cols-[160px_minmax(0,1fr)]">
      <button onClick={onOpen} className="framed self-start" aria-label={`Open certificate for ${art.title}`}>
        <img src={fileUrl(art.fileHash)} alt={art.title} className="aspect-square w-full object-cover" />
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-[28px] leading-tight">{art.title}</h3>
          <span className="text-sm text-ink-faint">
            {new Date(art.registeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        {art.description && <p className="mt-2 max-w-prose text-[15px] text-ink-soft">{art.description}</p>}
        <div className="mt-4 space-y-1.5">
          <ChainSeal block={art.block} confirmations={art.confirmations} />
          {art.history.length > 1 && <p className="text-[13px] text-ink-soft">Changed hands {art.history.length - 1} time{art.history.length === 2 ? '' : 's'}</p>}
          {art.reports.length > 0 && <p className="text-[13px] text-seal">{art.reports.length} suspected cop{art.reports.length === 1 ? 'y' : 'ies'} reported</p>}
        </div>
        <p className="machine mt-4">{art.fileHash}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          {children}
          <button onClick={onOpen} className="btn-link">View certificate</button>
        </div>
      </div>
    </li>
  );
}
