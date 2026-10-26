/**
 * Hashing, canonical encoding and ECDSA signatures.
 *
 * Wallets use ECDSA over the NIST P-256 curve because browsers can create and
 * use those keys natively (WebCrypto), so private keys never leave the
 * artist's browser. Signatures travel as raw r||s (IEEE P1363), which is what
 * WebCrypto produces.
 */
const crypto = require('node:crypto');

/** SHA-256 of a string (UTF-8) or Buffer, as lowercase hex. */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministic JSON: object keys sorted at every level, no whitespace.
 * Hashes and signatures are computed over this, so the browser and every
 * node must produce byte-identical output for the same value.
 */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * An address is a short, checkable name for a public key:
 * "ac" + first 40 hex chars of SHA-256(uncompressed public key).
 */
function addressFromPublicKey(publicKeyHex) {
  return 'ac' + sha256(Buffer.from(publicKeyHex, 'hex')).slice(0, 40);
}

function isPublicKeyHex(hex) {
  return typeof hex === 'string' && /^04[0-9a-f]{128}$/.test(hex);
}

/** Uncompressed P-256 point (04 || X || Y) -> Node KeyObject. */
function publicKeyObject(publicKeyHex) {
  const raw = Buffer.from(publicKeyHex, 'hex');
  return crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33, 65)) },
    format: 'jwk',
  });
}

/** Verify a P1363 ECDSA-SHA256 signature over a UTF-8 message. */
function verifySignature(publicKeyHex, message, signatureHex) {
  try {
    if (!isPublicKeyHex(publicKeyHex)) return false;
    if (typeof signatureHex !== 'string' || !/^[0-9a-f]{128}$/.test(signatureHex)) return false;
    return crypto.verify(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key: publicKeyObject(publicKeyHex), dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureHex, 'hex')
    );
  } catch {
    return false;
  }
}

/** New P-256 key pair. Used for node identities and in tests. */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const publicKeyHex =
    '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
  return {
    publicKey: publicKeyHex,
    privateJwk: privateKey.export({ format: 'jwk' }),
    address: addressFromPublicKey(publicKeyHex),
  };
}

function sign(privateJwk, message) {
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  return crypto.sign('sha256', Buffer.from(message, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }).toString('hex');
}

/** Bits that differ between two hex strings of equal length. */
function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return Infinity;
  let diff = BigInt('0x' + hexA) ^ BigInt('0x' + hexB);
  let bits = 0;
  while (diff > 0n) {
    bits += Number(diff & 1n);
    diff >>= 1n;
  }
  return bits;
}

module.exports = {
  sha256,
  canonical,
  addressFromPublicKey,
  isPublicKeyHex,
  verifySignature,
  generateKeyPair,
  sign,
  hammingDistance,
};
