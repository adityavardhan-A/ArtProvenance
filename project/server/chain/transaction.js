/**
 * Transactions: signed statements by a wallet.
 *
 *   IDENTITY  bind a display name to the sender's address
 *   REGISTER  claim authorship of an image, identified by its SHA-256
 *   TRANSFER  hand ownership of a registered work to another address
 *   REPORT    flag a suspected copy of a registered work
 *
 * The id is SHA-256 of the canonical unsigned body, and the signature is over
 * that id. Change any field and the id changes, so the signature no longer
 * verifies. Including the timestamp makes each id unique, which is what stops
 * the same signed transaction being replayed.
 */
const config = require('./config');
const { sha256, canonical, addressFromPublicKey, isPublicKeyHex, verifySignature } = require('./crypto');

const HEX64 = /^[0-9a-f]{64}$/;
const PHASH = /^[0-9a-f]{16}$/;
const ADDRESS = /^ac[0-9a-f]{40}$/;

function unsignedBody(tx) {
  return {
    type: tx.type,
    from: tx.from,
    publicKey: tx.publicKey,
    payload: tx.payload,
    timestamp: tx.timestamp,
  };
}

function computeTxId(tx) {
  return sha256(canonical(unsignedBody(tx)));
}

const isText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

/** Payload schema per type. Returns an error string or null. */
function checkPayload(type, p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'payload must be an object';

  switch (type) {
    case 'IDENTITY':
      return isText(p.name, 1, 60) ? null : 'name must be 1–60 characters';

    case 'REGISTER':
      if (!HEX64.test(p.fileHash || '')) return 'fileHash must be a SHA-256 hex digest';
      if (p.perceptualHash !== '' && !PHASH.test(p.perceptualHash || '')) return 'perceptualHash must be 16 hex chars or empty';
      if (!isText(p.title, 1, 120)) return 'title must be 1–120 characters';
      if (p.description !== undefined && !isText(p.description, 0, 1000)) return 'description is too long';
      if (p.mimeType !== undefined && !/^image\/[a-z0-9.+-]+$/.test(p.mimeType)) return 'mimeType must be an image type';
      if (p.size !== undefined && !(Number.isInteger(p.size) && p.size > 0 && p.size <= config.MAX_FILE_BYTES)) return 'size is invalid';
      return null;

    case 'TRANSFER':
      if (!HEX64.test(p.fileHash || '')) return 'fileHash must be a SHA-256 hex digest';
      if (!ADDRESS.test(p.to || '')) return 'to must be an ArtChain address';
      if (p.note !== undefined && !isText(p.note, 0, 200)) return 'note is too long';
      return null;

    case 'REPORT':
      if (!HEX64.test(p.suspectHash || '')) return 'suspectHash must be a SHA-256 hex digest';
      if (!HEX64.test(p.originalHash || '')) return 'originalHash must be a SHA-256 hex digest';
      if (!(Number.isInteger(p.distance) && p.distance >= 0 && p.distance <= 64)) return 'distance must be 0–64';
      if (p.note !== undefined && !isText(p.note, 0, 300)) return 'note is too long';
      return null;

    default:
      return `unknown transaction type ${type}`;
  }
}

/**
 * Stateless checks: shape, id, signature, sender address. Whether the
 * transaction is *allowed* (e.g. you own what you transfer) depends on chain
 * state and lives in state.js.
 */
function validateTransaction(tx) {
  if (!tx || typeof tx !== 'object') return 'transaction must be an object';
  if (!config.TX_TYPES.includes(tx.type)) return `unknown transaction type ${tx.type}`;
  if (!isPublicKeyHex(tx.publicKey)) return 'publicKey must be an uncompressed P-256 key in hex';
  if (tx.from !== addressFromPublicKey(tx.publicKey)) return 'from does not match publicKey';
  if (!Number.isInteger(tx.timestamp) || tx.timestamp <= 0) return 'timestamp must be a positive integer (ms)';

  const payloadError = checkPayload(tx.type, tx.payload);
  if (payloadError) return payloadError;

  if (Buffer.byteLength(canonical(tx)) > config.MAX_TX_BYTES) return 'transaction is too large';
  if (tx.id !== computeTxId(tx)) return 'id does not match transaction contents';
  if (!verifySignature(tx.publicKey, tx.id, tx.signature)) return 'signature is invalid';

  return null;
}

/** Build and sign a transaction with a private JWK (node side / tests). */
function createTransaction({ type, publicKey, privateJwk, payload, timestamp = Date.now() }, signFn) {
  const tx = { type, from: addressFromPublicKey(publicKey), publicKey, payload, timestamp };
  tx.id = computeTxId(tx);
  tx.signature = signFn(privateJwk, tx.id);
  return tx;
}

module.exports = { computeTxId, validateTransaction, createTransaction, unsignedBody, ADDRESS, HEX64 };
