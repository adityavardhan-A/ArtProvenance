/**
 * Client for an ArtChain node, plus the hashing needed to check its answers
 * independently in the browser (block hashes, Merkle proofs, signatures).
 *
 * The node is a convenience for reaching the network; nothing it says about
 * provenance has to be taken on trust, because every claim can be re-derived
 * here from the raw block data.
 */

export const NODE_URL: string = (import.meta.env.VITE_NODE_URL || 'http://localhost:4001').replace(/\/$/, '');

// ------------------------------------------------------------------- types

export type TxType = 'IDENTITY' | 'REGISTER' | 'TRANSFER' | 'REPORT';

export interface ChainTx {
  id: string;
  type: TxType;
  from: string;
  publicKey: string;
  payload: Record<string, any>;
  timestamp: number;
  signature: string;
}

export interface BlockHeader {
  index: number;
  timestamp: number;
  previousHash: string;
  merkleRoot: string;
  difficulty: number;
  nonce: number;
  miner: string;
}

export interface BlockSummary extends BlockHeader {
  hash: string;
  txCount: number;
  types: TxType[];
  confirmations: number;
}

export interface Block extends BlockHeader {
  hash: string;
  transactions: ChainTx[];
  confirmations: number;
  merkleLevels: string[][];
}

export interface HistoryEvent {
  type: TxType;
  txId: string;
  block: number;
  timestamp: number;
  from: string | null;
  to: string;
  fromName: string | null;
  toName: string | null;
  note?: string;
}

export interface Report {
  txId: string;
  block: number;
  timestamp: number;
  reporter: string;
  reporterName: string | null;
  suspectHash: string;
  distance: number;
  note: string;
}

export interface Artwork {
  fileHash: string;
  perceptualHash: string;
  title: string;
  description: string;
  mimeType: string;
  size: number | null;
  creator: string;
  creatorName: string | null;
  owner: string;
  ownerName: string | null;
  registeredAt: number;
  block: number;
  blockHash: string;
  txId: string;
  confirmations: number;
  history: HistoryEvent[];
  reports: Report[];
}

export interface TxLookup {
  tx: ChainTx;
  status: 'pending' | 'confirmed';
  blockIndex?: number;
  blockHash?: string;
  blockTimestamp?: number;
  confirmations: number;
}

export interface PeerStatus {
  url: string;
  online: boolean;
  name: string | null;
  height: number | null;
  tipHash: string | null;
  inSync: boolean;
}

export interface NodeStatus {
  node: { name: string; url: string; address: string; mining: boolean; files: number };
  chain: string;
  height: number;
  tipHash: string;
  tipTimestamp: number;
  genesisHash: string;
  difficulty: number;
  cumulativeWork: number;
  transactions: number;
  artworks: number;
  identities: number;
  mempool: number;
  mining: {
    active: boolean;
    progress: number;
    lastBlock: { index: number; attempts: number; ms: number } | null;
    blocksMinedHere: number;
    hashRate: number | null;
  };
  rules: { minDifficulty: number; maxDifficulty: number; maxTxPerBlock: number; nearDuplicateBits: number };
  peers: PeerStatus[];
}

export interface MerkleStep {
  hash: string;
  position: 'left' | 'right';
}

export interface Proof {
  txId: string;
  blockIndex: number;
  blockHash: string;
  header: BlockHeader;
  leafCount: number;
  proof: MerkleStep[];
  confirmations: number;
}

export interface ValidationReport {
  valid: boolean;
  height: number;
  firstInvalid: number | null;
  counts: { blocks: number; transactions: number };
  blocks: {
    index: number;
    hash: string;
    ok: boolean;
    problems: string[];
    checks: Record<'link' | 'hash' | 'pow' | 'merkle' | 'signatures' | 'rules' | 'time', boolean>;
  }[];
}

export interface TamperReport {
  error?: string;
  target: { index: number; hash: string; txId: string; type: TxType };
  edit: { field: string; before: string; after: string };
  scenarios: {
    key: string;
    title: string;
    what: string;
    note?: string;
    result: { valid: boolean; firstInvalid: number | null; brokenBlocks: number[]; problems: { index: number; problems: string[] }[] };
  }[];
  realChainValid: boolean;
}

export interface Account {
  address: string;
  name: string | null;
  owned: Artwork[];
  created: Artwork[];
  transactions: TxLookup[];
  pending: TxLookup[];
}

export class ChainError extends Error {
  code?: string;
  details?: any;
  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------- transport

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(NODE_URL + path, init);
  } catch {
    throw new ChainError(
      `Can't reach the ArtChain node at ${NODE_URL}. Start it with "npm start" in the server folder.`,
      'NODE_OFFLINE'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChainError(data.error || `Node returned ${res.status}`, data.code, data.details);
  return data as T;
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const fileUrl = (hash: string) => `${NODE_URL}/files/${hash}`;

export const getStatus = () => call<NodeStatus>('/status');
export const getBlocks = (before?: number, limit = 20) =>
  call<{ height: number; blocks: BlockSummary[] }>(`/blocks?limit=${limit}${before !== undefined ? `&before=${before}` : ''}`);
export const getBlock = (id: string | number) => call<Block>(`/blocks/${id}`);
export const getTx = (id: string) => call<TxLookup>(`/tx/${id}`);
export const getProof = (id: string) => call<Proof>(`/tx/${id}/proof`);
export const getMempool = () => call<{ size: number; transactions: ChainTx[] }>('/mempool');
export const getArtworks = () => call<{ height: number; artworks: Artwork[] }>('/artworks');
export const getAccount = (address: string) => call<Account>(`/accounts/${address}`);
export const getIdentities = () => call<{ identities: { address: string; name: string }[] }>('/identities');
export const validateChain = () => call<ValidationReport>('/chain/validate');
export const tamperDemo = (index?: number) => post<TamperReport>('/chain/tamper-demo', { index });
export const mineNow = () => post<{ mined: boolean; reason?: string; block?: BlockSummary; stats?: { attempts: number; ms: number } }>('/mine', {});

export async function getArtwork(fileHash: string): Promise<Artwork | null> {
  try {
    return await call<Artwork>(`/artworks/${fileHash}`);
  } catch (e) {
    if (e instanceof ChainError && /not found/i.test(e.message)) return null;
    throw e;
  }
}

export async function findSimilar(perceptualHash: string, maxBits = 20, exclude?: string) {
  if (!/^[0-9a-f]{16}$/.test(perceptualHash)) return [];
  const q = `?max=${maxBits}${exclude ? `&exclude=${exclude}` : ''}`;
  const { matches } = await call<{ matches: { distance: number; artwork: Artwork }[] }>(`/similar/${perceptualHash}${q}`);
  return matches;
}

/** Upload image bytes to the node's content-addressed store. */
export async function uploadFile(file: File, mimeType: string): Promise<{ hash: string; size: number }> {
  return call('/files', { method: 'POST', headers: { 'content-type': mimeType }, body: file });
}

export const submitTx = (tx: ChainTx) => post<{ id: string; status: 'pending' }>('/tx', tx);

/**
 * Poll until a transaction is mined into a block (or time runs out).
 * `onUpdate` sees each status so the UI can show mempool -> block.
 */
export async function waitForConfirmation(
  id: string,
  onUpdate?: (t: TxLookup) => void,
  timeoutMs = 90_000
): Promise<TxLookup> {
  const start = Date.now();
  for (;;) {
    try {
      const t = await getTx(id);
      onUpdate?.(t);
      if (t.status === 'confirmed') return t;
    } catch (e) {
      if (!(e instanceof ChainError) || e.code === 'NODE_OFFLINE') throw e;
    }
    if (Date.now() - start > timeoutMs) {
      throw new ChainError('The transaction is still waiting in the mempool. Is a mining node running?', 'TIMEOUT');
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

// ------------------------------------------------------- local verification

/** Same canonical JSON as the node: keys sorted at every level. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

export function headerOf(b: BlockHeader): BlockHeader {
  return {
    index: b.index,
    timestamp: b.timestamp,
    previousHash: b.previousHash,
    merkleRoot: b.merkleRoot,
    difficulty: b.difficulty,
    nonce: b.nonce,
    miner: b.miner,
  };
}

export const blockHashOf = (b: BlockHeader) => sha256Hex(canonical(headerOf(b)));

export async function txIdOf(tx: ChainTx): Promise<string> {
  return sha256Hex(canonical({ type: tx.type, from: tx.from, publicKey: tx.publicKey, payload: tx.payload, timestamp: tx.timestamp }));
}

/** Walk a Merkle proof from the leaf up; returns each intermediate hash. */
export async function walkMerkleProof(leaf: string, proof: MerkleStep[]): Promise<string[]> {
  const path = [leaf];
  let running = leaf;
  for (const step of proof) {
    running = await sha256Hex(step.position === 'left' ? step.hash + running : running + step.hash);
    path.push(running);
  }
  return path;
}

/** Verify an ECDSA P-256 signature over a transaction id. */
export async function verifyTxSignature(tx: ChainTx): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', fromHex(tx.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromHex(tx.signature), new TextEncoder().encode(tx.id));
  } catch {
    return false;
  }
}

export async function addressOf(publicKeyHex: string): Promise<string> {
  return 'ac' + (await sha256Hex(fromHex(publicKeyHex))).slice(0, 40);
}

export interface ProofCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Re-derive, in this browser, everything that makes a registration
 * trustworthy: the transaction's id and signature, its path up the Merkle
 * tree to the block header, the block hash, its proof-of-work, and its link
 * to the block before.
 */
export async function verifyInclusion(tx: ChainTx): Promise<{ checks: ProofCheck[]; proof: Proof; path: string[] }> {
  const proof = await getProof(tx.id);
  const checks: ProofCheck[] = [];

  const id = await txIdOf(tx);
  checks.push({
    label: 'Transaction fingerprint',
    ok: id === tx.id,
    detail: `SHA-256 of the transaction's contents is ${short(id)}.`,
  });

  const sigOk = await verifyTxSignature(tx);
  const addr = await addressOf(tx.publicKey);
  checks.push({
    label: 'Artist’s signature',
    ok: sigOk && addr === tx.from,
    detail: sigOk ? `ECDSA P-256 signature checks out against the key of ${short(tx.from)}.` : 'Signature does not match the public key.',
  });

  const path = await walkMerkleProof(tx.id, proof.proof);
  const root = path[path.length - 1];
  checks.push({
    label: 'Merkle proof',
    ok: root === proof.header.merkleRoot,
    detail:
      proof.proof.length === 0
        ? `This is the only transaction in block #${proof.blockIndex}, so its id is itself the Merkle root in the header.`
        : `${proof.proof.length} hash step${proof.proof.length === 1 ? '' : 's'} lead from the transaction to root ${short(root)}, which is in block #${proof.blockIndex}'s header.`,
  });

  const hash = await blockHashOf(proof.header);
  checks.push({
    label: 'Block hash',
    ok: hash === proof.blockHash,
    detail: `Hashing block #${proof.blockIndex}'s header gives ${short(hash)}.`,
  });

  const zeros = '0'.repeat(proof.header.difficulty);
  checks.push({
    label: 'Proof-of-work',
    ok: hash.startsWith(zeros),
    detail: `The hash starts with ${proof.header.difficulty} zeros; finding nonce ${proof.header.nonce.toLocaleString()} took about ${(16 ** proof.header.difficulty).toLocaleString()} attempts.`,
  });

  if (proof.blockIndex > 0) {
    const prev = await getBlock(proof.blockIndex - 1);
    const prevHash = await blockHashOf(prev);
    checks.push({
      label: 'Chain link',
      ok: prevHash === proof.header.previousHash,
      detail: `Block #${proof.blockIndex} points at block #${prev.index}, whose header hashes to ${short(prevHash)}.`,
    });
  }

  checks.push({
    label: 'Confirmations',
    ok: proof.confirmations >= 1,
    detail: `${proof.confirmations} block${proof.confirmations === 1 ? '' : 's'} deep. Rewriting it means re-mining all of them faster than the network.`,
  });

  return { checks, proof, path };
}

export function short(h?: string | null, n = 10): string {
  if (!h) return '';
  return h.length > n + 2 ? `${h.slice(0, n)}…` : h;
}

export function shortAddress(a?: string | null): string {
  if (!a) return '';
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
}

export function displayName(name: string | null | undefined, address: string): string {
  return name || shortAddress(address);
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const TX_LABELS: Record<TxType, string> = {
  IDENTITY: 'Identity',
  REGISTER: 'Registration',
  TRANSFER: 'Transfer',
  REPORT: 'Forgery report',
};
