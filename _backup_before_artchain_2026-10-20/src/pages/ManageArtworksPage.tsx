import { useState, useEffect, useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { supabase, type ArtworkMetadata } from '../lib/supabase';
import { registerImageHash, getProvenance } from '../lib/contract-interactions';
import Navbar from '../components/Navbar';
import Alert from '../components/Alert';
import ConfirmDialog from '../components/ConfirmDialog';
import ChainSeal from '../components/ChainSeal';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ManageArtworksPage() {
  const [userArtworks, setUserArtworks] = useState<ArtworkMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingArtwork, setEditingArtwork] = useState<string | null>(null);
  const [artworkData, setArtworkData] = useState({ title: '', description: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ArtworkMetadata | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const { user } = useAuth();
  const { address, isConnected, isCorrectNetwork } = useWallet();

  const fetchUserArtworks = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('artwork_metadata')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setUserArtworks(data || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserArtworks();
  }, [fetchUserArtworks]);

  const handleEditArtwork = (artwork: ArtworkMetadata) => {
    setEditingArtwork(artwork.id);
    setArtworkData({ title: artwork.title, description: artwork.description || '' });
  };

  const handleUpdateArtwork = async (artworkId: string) => {
    try {
      const { error } = await supabase
        .from('artwork_metadata')
        .update({ title: artworkData.title, description: artworkData.description })
        .eq('id', artworkId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Changes saved.' });
      setEditingArtwork(null);
      fetchUserArtworks();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  /** Try the chain write again for a work saved while the ledger was down. */
  const handleRetry = async (artwork: ArtworkMetadata) => {
    setRetrying(artwork.id);
    setMessage(null);
    try {
      const result = await registerImageHash(artwork.hash, artwork.perceptual_hash ?? '', {
        useWallet: isConnected && isCorrectNetwork,
        creditTo: address ?? undefined,
      });

      let update: Partial<ArtworkMetadata> | null = null;

      if (result.success) {
        update = {
          chain_status: 'confirmed',
          chain_error: null,
          tx_hash: result.transactionHash ?? null,
          block_number: result.blockNumber ?? null,
          owner_address: result.ownerAddress ?? null,
          registered_at: new Date().toISOString(),
        };
      } else if (result.alreadyRegistered && (await getProvenance(artwork.hash))?.blockNumber) {
        // An earlier attempt already wrote it; adopt that record. The block
        // number check rules out the relayer's in-memory fallback, which also
        // answers "already registered" but has never touched the chain.
        const record = await getProvenance(artwork.hash);
        update = {
          chain_status: 'confirmed',
          chain_error: null,
          block_number: record?.blockNumber ?? null,
          owner_address: record?.owner ?? null,
          registered_at: record ? new Date(record.timestamp).toISOString() : null,
        };
      } else {
        update = { chain_status: 'pending', chain_error: result.error ?? 'Unknown error' };
      }

      const { error } = await supabase.from('artwork_metadata').update(update).eq('id', artwork.id).eq('user_id', user?.id);
      if (error) throw error;

      setMessage(
        update.chain_status === 'confirmed'
          ? { type: 'success', text: `“${artwork.title}” is now recorded on Sepolia.` }
          : { type: 'warning', text: `Still couldn’t record “${artwork.title}”: ${result.error}` }
      );
      fetchUserArtworks();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setRetrying(null);
    }
  };

  const handleDeleteArtwork = async () => {
    const artwork = pendingDelete;
    setPendingDelete(null);
    if (!artwork) return;

    try {
      const { error: dbError } = await supabase
        .from('artwork_metadata')
        .delete()
        .eq('id', artwork.id)
        .eq('user_id', user?.id);

      if (dbError) throw dbError;

      const fileName = artwork.image_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('artworks').remove([`${user?.id}/${fileName}`]);
      }

      setMessage({ type: 'success', text: `“${artwork.title}” removed from the collection.` });
      fetchUserArtworks();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const onChain = userArtworks.filter((a) => a.chain_status === 'confirmed').length;

  return (
    <div className="min-h-screen">
      <Navbar />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Remove “${pendingDelete?.title ?? ''}”?`}
        message={
          pendingDelete?.chain_status === 'confirmed'
            ? 'The image and its details leave the collection. Its fingerprint stays on the Sepolia ledger permanently — blockchain records can’t be erased.'
            : 'The image and its details leave the collection. This can’t be undone.'
        }
        confirmText="Remove work"
        cancelText="Keep it"
        type="danger"
        onConfirm={handleDeleteArtwork}
        onCancel={() => setPendingDelete(null)}
      />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <h1 className="text-[44px] leading-[1.02] sm:text-[52px]">My works</h1>
        {!loading && userArtworks.length > 0 && (
          <p className="mt-3 text-[17px] text-ink-soft">
            {userArtworks.length} registered, {onChain} recorded on chain
            {userArtworks.length - onChain > 0 && `, ${userArtworks.length - onChain} waiting`}.
          </p>
        )}

        {message && (
          <div className="mt-6">
            <Alert type={message.type} message={message.text} onClose={() => setMessage(null)} />
          </div>
        )}

        {loading ? (
          <LoadingSpinner fullScreen={false} />
        ) : userArtworks.length === 0 ? (
          <div className="py-20">
            <h2 className="text-3xl">Nothing here yet</h2>
            <p className="mt-2 text-ink-soft">Works you register from the collection page will appear here.</p>
          </div>
        ) : (
          <ul className="mt-10 divide-y divide-ink/15 border-y border-ink/15">
            {userArtworks.map((artwork) => (
              <li key={artwork.id} className="grid gap-6 py-8 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="framed self-start">
                  <img src={artwork.image_url} alt={artwork.title} className="aspect-square w-full object-cover" />
                </div>

                <div className="min-w-0">
                  {editingArtwork === artwork.id ? (
                    <div className="space-y-5">
                      <div>
                        <label className="field-label" htmlFor={`t-${artwork.id}`}>Title</label>
                        <input
                          id={`t-${artwork.id}`}
                          type="text"
                          value={artworkData.title}
                          onChange={(e) => setArtworkData({ ...artworkData, title: e.target.value })}
                          className="field font-display text-2xl"
                        />
                      </div>
                      <div>
                        <label className="field-label" htmlFor={`d-${artwork.id}`}>About the work</label>
                        <textarea
                          id={`d-${artwork.id}`}
                          value={artworkData.description}
                          onChange={(e) => setArtworkData({ ...artworkData, description: e.target.value })}
                          className="field-boxed"
                          rows={3}
                        />
                      </div>
                      <p className="text-[13px] text-ink-faint">
                        Title and description live in the database only. The image itself can’t be changed — its
                        fingerprint is what the chain recorded.
                      </p>
                      <div className="flex gap-3">
                        <button onClick={() => handleUpdateArtwork(artwork.id)} className="btn-primary">
                          Save changes
                        </button>
                        <button onClick={() => setEditingArtwork(null)} className="btn-secondary">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 className="text-[28px] leading-tight">{artwork.title}</h2>
                        <span className="text-sm text-ink-faint">
                          Added{' '}
                          {new Date(artwork.uploaded_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      {artwork.description && (
                        <p className="mt-2 max-w-prose text-[15px] text-ink-soft">{artwork.description}</p>
                      )}

                      <div className="mt-4 max-w-md">
                        <ChainSeal status={artwork.chain_status} blockNumber={artwork.block_number} txHash={artwork.tx_hash} />
                        {artwork.chain_status !== 'confirmed' && artwork.chain_error && (
                          <p className="mt-1.5 text-[13px] text-ink-soft">{artwork.chain_error}</p>
                        )}
                      </div>

                      <p className="machine mt-4">{artwork.hash}</p>

                      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                        {artwork.chain_status !== 'confirmed' && (
                          <button
                            onClick={() => handleRetry(artwork)}
                            disabled={retrying === artwork.id}
                            className="btn-secondary py-2"
                          >
                            <RotateCw className={`h-4 w-4 ${retrying === artwork.id ? 'animate-spin' : ''}`} aria-hidden />
                            {retrying === artwork.id ? 'Recording…' : 'Record on chain'}
                          </button>
                        )}
                        <button onClick={() => handleEditArtwork(artwork)} className="btn-link">
                          Edit details
                        </button>
                        <button onClick={() => setPendingDelete(artwork)} className="btn-link text-seal decoration-seal/30 hover:decoration-seal">
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
