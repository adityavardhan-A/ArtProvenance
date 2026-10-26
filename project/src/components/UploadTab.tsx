import { useState } from 'react';
import { Link } from 'react-router-dom';
import { checkImageFile, generateFileHash, imageTypeOf } from '../lib/hashing';
import { generatePerceptualHash, detectScreenshot } from '../lib/perceptual-hash';
import {
  ChainError,
  displayName,
  fileUrl,
  findSimilar,
  getArtwork,
  getBlock,
  short,
  submitTx,
  uploadFile,
  waitForConfirmation,
  type Block,
} from '../lib/artchain';
import { signTransaction } from '../lib/wallet';
import { useWallet } from '../contexts/WalletContext';
import Toast from './Toast';
import DropZone from './DropZone';
import HashFrame from './HashFrame';
import ChainSeal from './ChainSeal';

type ToastState = { type: 'success' | 'error' | 'warning'; title: string; message: string } | null;

const STEPS = [
  'Rule out screenshots and resized copies',
  'Fingerprint the file (SHA-256 and perceptual hash)',
  'Ask the chain whether this work, or one like it, exists',
  'Store the image on the node, addressed by its hash',
  'Sign a REGISTER transaction with your private key',
  'Broadcast it to the network’s mempool',
  'Wait for a node to mine it into a block',
];

/**
 * A work by another artist this close (bits of 64) is blocked, matching the
 * rule every node enforces. Anything further is allowed.
 */
const COPY_BITS = 10;

export default function UploadTab() {
  const { wallet, address } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [detail, setDetail] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [result, setResult] = useState<{ title: string; fileHash: string; txId: string; block: Block } | null>(null);

  const busy = stage > 0;
  const note = (n: number, text: string) => setDetail((d) => ({ ...d, [n]: text }));

  const [checking, setChecking] = useState(false);
  const [screenshotWarning, setScreenshotWarning] = useState<string | null>(null);

  const handleFileChange = async (selected: File) => {
    setToast(null);
    setScreenshotWarning(null);
    setChecking(true);
    const url = URL.createObjectURL(selected);
    const problem = await checkImageFile(selected, url);
    setChecking(false);
    if (problem) {
      URL.revokeObjectURL(url);
      setToast({ type: 'error', title: 'Can’t use that file', message: problem });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(url);
  };

  const stop = (t: ToastState) => {
    setToast(t);
    setStage(0);
  };

  const handleSubmit = async (e?: React.FormEvent, allowScreenshot = false) => {
    e?.preventDefault();
    if (!file || !title.trim() || !wallet) return;

    setToast(null);
    setResult(null);
    setDetail({});
    setScreenshotWarning(null);

    try {
      // 1. Screenshot / resize screen. A warning the artist can override:
      // flat digital art can look like a screenshot to these heuristics.
      setStage(1);
      if (!allowScreenshot) {
        const shot = await detectScreenshot(file);
        if (shot.isScreenshot) {
          setStage(0);
          setScreenshotWarning(shot.reason);
          return;
        }
      } else {
        note(1, 'Skipped: you confirmed this is your original file.');
      }

      // 2. Fingerprints
      setStage(2);
      const fileHash = await generateFileHash(file);
      const perceptualHash = await generatePerceptualHash(file);
      note(2, `SHA-256 ${short(fileHash, 16)}, pHash ${perceptualHash}`);

      // 3. Ask the chain
      setStage(3);
      const existing = await getArtwork(fileHash);
      if (existing) {
        return stop({
          type: 'error',
          title: 'Already on the chain',
          message: `This exact file was registered as “${existing.title}” by ${displayName(existing.creatorName, existing.creator)} in block #${existing.block}.`,
        });
      }
      const similar = (await findSimilar(perceptualHash, COPY_BITS)).filter((m) => m.artwork.creator !== address);
      if (similar.length) {
        const m = similar[0];
        return stop({
          type: 'error',
          title: 'This looks like someone else’s work',
          message: `It is visually close to “${m.artwork.title}” by ${displayName(m.artwork.creatorName, m.artwork.creator)} (${m.distance} of 64 fingerprint bits differ).`,
        });
      }
      note(3, 'No exact or near match among registered works.');

      // 4. Content-addressed storage
      setStage(4);
      const mimeType = imageTypeOf(file) || 'image/jpeg';
      const stored = await uploadFile(file, mimeType);
      if (stored.hash !== fileHash) throw new Error('The node stored different bytes than were sent.');
      note(4, `Stored at /files/${short(stored.hash, 16)}`);

      // 5. Sign
      setStage(5);
      const tx = await signTransaction(wallet, 'REGISTER', {
        fileHash,
        perceptualHash,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        mimeType,
        size: file.size,
      });
      note(5, `Transaction ${short(tx.id, 16)} signed by ${short(tx.from, 12)}`);

      // 6. Broadcast
      setStage(6);
      await submitTx(tx);
      note(6, 'Accepted by the node and gossiped to its peers.');

      // 7. Mined
      setStage(7);
      const confirmed = await waitForConfirmation(tx.id);
      const block = await getBlock(confirmed.blockIndex!);
      note(7, `Block #${block.index}, nonce ${block.nonce.toLocaleString()}, hash ${short(block.hash, 16)}`);

      setResult({ title: title.trim(), fileHash, txId: tx.id, block });
      setToast({
        type: 'success',
        title: 'Sealed on ArtChain',
        message: `“${title.trim()}” is in block #${block.index}. Every node now holds the record.`,
      });
      setFile(null);
      setPreview(null);
      setTitle('');
      setDescription('');
      setStage(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      const code = err instanceof ChainError ? err.code : undefined;
      stop({
        type: 'error',
        title: code === 'SUSPECTED_COPY' ? 'The network rejected it as a copy' : 'Registration stopped',
        message: msg,
      });
    }
  };

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <DropZone
          id="file-upload"
          preview={preview}
          onFile={handleFileChange}
          onClear={() => {
            if (preview) URL.revokeObjectURL(preview);
            setFile(null);
            setPreview(null);
            setScreenshotWarning(null);
          }}
          prompt="Place your work here"
          scanning={stage >= 1 && stage <= 3}
        />

        <div>
          {busy ? (
            <div className="animate-rise" role="status" aria-live="polite">
              <h3 className="text-3xl">Registering “{title}”</h3>
              <ol className="mt-7 space-y-4">
                {STEPS.map((label, i) => {
                  const n = i + 1;
                  const state = n < stage ? 'done' : n === stage ? 'active' : 'todo';
                  return (
                    <li key={label} className="grid grid-cols-[24px_minmax(0,1fr)] gap-4">
                      <span
                        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border font-display text-[13px] ${
                          state === 'done' ? 'border-note bg-note text-paper-mat' : state === 'active' ? 'border-ink text-ink' : 'border-ink/20 text-ink-faint'
                        }`}
                      >
                        {n}
                      </span>
                      <span>
                        <span className={state === 'todo' ? 'text-ink-faint' : state === 'active' ? 'text-ink' : 'text-ink-soft'}>
                          {label}
                          {state === 'active' && <span className="ml-1 inline-block animate-pulse">…</span>}
                        </span>
                        {detail[n] && <span className="machine mt-0.5 block">{detail[n]}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7">
              <div>
                <label htmlFor="title" className="field-label">Title</label>
                <input
                  id="title"
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="field font-display text-2xl"
                  placeholder="Untitled No. 4"
                />
              </div>

              <div>
                <label htmlFor="description" className="field-label">About the work <span className="text-ink-faint">(optional)</span></label>
                <textarea
                  id="description"
                  rows={4}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="field-boxed resize-y"
                  placeholder="Medium, year, edition, anything a collector should know"
                />
              </div>

              <p className="border-l-2 border-ink/20 pl-4 text-[13.5px] leading-relaxed text-ink-soft">
                Title and description are written on chain and can never be edited. Your wallet{' '}
                <span className="font-mono text-[12.5px] text-ink">{short(address, 12)}</span> signs the registration, so
                the chain records you as creator. No fees: ArtChain runs on your own nodes.
              </p>

              {screenshotWarning && (
                <div className="rounded-[3px] border border-ochre/40 bg-ochre-light p-4 text-[14px] text-ink" role="alert">
                  <p className="font-medium text-ochre">This looks like a screenshot</p>
                  <p className="mt-1 text-ink-soft">{screenshotWarning}. Screenshots of someone else’s work shouldn’t be registered.</p>
                  <button type="button" onClick={() => handleSubmit(undefined, true)} className="btn-secondary mt-3 py-2">
                    It’s my original file, register it anyway
                  </button>
                </div>
              )}

              <button type="submit" disabled={!file || !title.trim() || !wallet || checking} className="btn-primary w-full py-3.5">
                Sign and register
              </button>
              {checking && <p className="-mt-3 text-center text-[13px] text-ink-faint">Opening the image…</p>}
              {!file && !checking && <p className="-mt-3 text-center text-[13px] text-ink-faint">Add an image to continue</p>}
              {file && !title.trim() && <p className="-mt-3 text-center text-[13px] text-ink-faint">Give the work a title to continue</p>}
            </form>
          )}

          {result && !busy && (
            <div className="mt-12 animate-rise border-t border-ink/15 pt-8">
              <p className="text-sm text-ink-soft">Just sealed</p>
              <div className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-5">
                <HashFrame hash={result.fileHash} tone="note">
                  <img src={fileUrl(result.fileHash)} alt={result.title} className="aspect-square w-full object-cover" />
                </HashFrame>
                <div className="min-w-0">
                  <h4 className="font-display text-2xl leading-tight">{result.title}</h4>
                  <div className="mt-3">
                    <ChainSeal block={result.block.index} confirmations={result.block.confirmations} />
                  </div>
                  <dl className="mt-3 space-y-1 text-[13px]">
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-ink-soft">Block hash</dt>
                      <dd className="machine">{result.block.hash}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-ink-soft">Nonce</dt>
                      <dd className="machine">{result.block.nonce.toLocaleString()}</dd>
                    </div>
                  </dl>
                  <Link to={`/explorer/tx/${result.txId}`} className="btn-link mt-4">
                    Open the transaction in the explorer
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

