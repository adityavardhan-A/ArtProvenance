import { useState, useEffect, useMemo } from 'react';
import { supabase, type ArtworkMetadata } from '../lib/supabase';
import Toast from './Toast';
import ImagePreviewModal from './ImagePreviewModal';
import ChainSeal from './ChainSeal';
import LoadingSpinner from './LoadingSpinner';

type GalleryArtwork = ArtworkMetadata & { profiles?: { full_name: string | null; email: string | null } };
type Filter = 'all' | 'confirmed' | 'waiting';

const artistOf = (a: GalleryArtwork) =>
  a.profiles?.full_name || a.profiles?.email?.split('@')[0] || 'Unknown artist';

export default function GalleryTab({ onRegister }: { onRegister?: () => void }) {
  const [artworks, setArtworks] = useState<GalleryArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; title: string; message: string } | null>(null);
  const [open, setOpen] = useState<GalleryArtwork | null>(null);

  useEffect(() => {
    fetchAllArtworks();
  }, []);

  const fetchAllArtworks = async () => {
    try {
      // Every user's artworks, for the shared collection.
      const { data, error } = await supabase
        .from('artwork_metadata')
        .select(`
          *,
          profiles!inner(full_name, email)
        `)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setArtworks(data || []);
    } catch (error: any) {
      setToast({ type: 'error', title: 'Couldn’t load the collection', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: artworks.length,
      confirmed: artworks.filter((a) => a.chain_status === 'confirmed').length,
      waiting: artworks.filter((a) => a.chain_status !== 'confirmed').length,
    }),
    [artworks]
  );

  const shown = artworks.filter((a) =>
    filter === 'all' ? true : filter === 'confirmed' ? a.chain_status === 'confirmed' : a.chain_status !== 'confirmed'
  );

  if (loading) return <LoadingSpinner fullScreen={false} />;

  return (
    <div>
      <ImagePreviewModal artwork={open} artist={open ? artistOf(open) : ''} onClose={() => setOpen(null)} />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {artworks.length === 0 ? (
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="framed mx-auto mb-8 flex aspect-[4/5] w-40 items-center justify-center">
            <div className="h-full w-full bg-paper-deep" />
          </div>
          <h3 className="text-3xl">The walls are empty</h3>
          <p className="mt-3 text-ink-soft">
            Register a work to fingerprint it and record it on the Sepolia ledger. It will hang here for anyone to
            verify.
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
                ['confirmed', 'Recorded on chain'],
                ['waiting', 'Waiting'],
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
                {label} <span className="text-ink-faint">{counts[key]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="py-16 text-center text-ink-soft">No works match this filter.</p>
          ) : (
            <div className="columns-1 gap-x-10 sm:columns-2 lg:columns-3 xl:columns-4">
              {shown.map((artwork) => (
                <figure key={artwork.id} className="mb-12 break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => setOpen(artwork)}
                    className="framed block w-full transition-transform duration-200 hover:-translate-y-0.5"
                    aria-label={`Open certificate for ${artwork.title}`}
                  >
                    <img src={artwork.image_url} alt={artwork.title} loading="lazy" className="block w-full" />
                  </button>

                  {/* Wall label */}
                  <figcaption className="mt-4 pl-0.5">
                    <h3 className="text-[21px] leading-tight">{artwork.title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      {artistOf(artwork)}, {new Date(artwork.uploaded_at).getFullYear()}
                    </p>
                    {artwork.description && (
                      <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{artwork.description}</p>
                    )}
                    <div className="mt-3">
                      <ChainSeal status={artwork.chain_status} blockNumber={artwork.block_number} compact />
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
