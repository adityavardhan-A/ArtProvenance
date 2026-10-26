import { useCallback, useEffect, useState } from 'react';
import ImagePreviewModal from './ImagePreviewModal';
import ChainSeal from './ChainSeal';
import LoadingSpinner from './LoadingSpinner';
import { useWallet } from '../contexts/WalletContext';
import { displayName, fileUrl, getArtworks, type Artwork } from '../lib/artchain';

type Filter = 'all' | 'mine' | 'traded' | 'reported';

/** The collection, read straight from chain state on the node. */
export default function GalleryTab({ onRegister }: { onRegister?: () => void }) {
  const { address } = useWallet();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { artworks } = await getArtworks();
      setArtworks(artworks);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the collection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const tests: Record<Filter, (a: Artwork) => boolean> = {
    all: () => true,
    mine: (a) => a.owner === address,
    traded: (a) => a.history.length > 1,
    reported: (a) => a.reports.length > 0,
  };
  const shown = artworks.filter(tests[filter]);

  if (loading) return <LoadingSpinner fullScreen={false} />;

  if (error) {
    return (
      <div className="max-w-xl py-12">
        <h3 className="text-3xl">The collection is on the chain, and the chain isn’t answering</h3>
        <p className="mt-3 text-ink-soft">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <ImagePreviewModal fileHash={open} onClose={() => setOpen(null)} onChanged={load} />

      {artworks.length === 0 ? (
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="framed mx-auto mb-8 flex aspect-[4/5] w-40 items-center justify-center">
            <div className="h-full w-full bg-paper-deep" />
          </div>
          <h3 className="text-3xl">The walls are empty</h3>
          <p className="mt-3 text-ink-soft">
            Register a work to sign it with your key and have the network mine it into a block. It will hang here for
            anyone to verify.
          </p>
          {onRegister && (
            <button onClick={onRegister} className="btn-primary mt-7">
              Register your first work
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2" role="tablist" aria-label="Filter works">
            {(
              [
                ['all', 'All works'],
                ['mine', 'Owned by me'],
                ['traded', 'Changed hands'],
                ['reported', 'Copies reported'],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`text-sm transition-colors ${
                  filter === key ? 'text-ink underline decoration-ink decoration-1 underline-offset-[6px]' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {label} <span className="text-ink-faint">{artworks.filter(tests[key]).length}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="py-16 text-center text-ink-soft">No works match this filter.</p>
          ) : (
            <div className="columns-1 gap-x-10 sm:columns-2 lg:columns-3 xl:columns-4">
              {shown.map((art) => (
                <figure key={art.fileHash} className="mb-12 break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => setOpen(art.fileHash)}
                    className="framed block w-full transition-transform duration-200 hover:-translate-y-0.5"
                    aria-label={`Open certificate for ${art.title}`}
                  >
                    <img src={fileUrl(art.fileHash)} alt={art.title} loading="lazy" className="block w-full" />
                  </button>
                  <figcaption className="mt-4 pl-0.5">
                    <h3 className="text-[21px] leading-tight">{art.title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      {displayName(art.creatorName, art.creator)}, {new Date(art.registeredAt).getFullYear()}
                      {art.owner !== art.creator && <>, owned by {displayName(art.ownerName, art.owner)}</>}
                    </p>
                    {art.description && (
                      <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{art.description}</p>
                    )}
                    <div className="mt-3 space-y-1.5">
                      <ChainSeal block={art.block} compact />
                      {art.reports.length > 0 && (
                        <p className="text-[13px] text-seal">
                          {art.reports.length} cop{art.reports.length === 1 ? 'y' : 'ies'} reported on chain
                        </p>
                      )}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
