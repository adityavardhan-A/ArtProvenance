const { generateKeyPair, sign } = require('../chain/crypto');
const { createTransaction } = require('../chain/transaction');
const { sha256 } = require('../chain/crypto');

function wallet() {
  return generateKeyPair();
}

function tx(w, type, payload, timestamp = Date.now()) {
  return createTransaction({ type, publicKey: w.publicKey, privateJwk: w.privateJwk, payload, timestamp }, sign);
}

/** A fake image hash and a perceptual hash. */
function art(seed, phash = '0123456789abcdef') {
  return { fileHash: sha256('image-' + seed), perceptualHash: phash, title: `Work ${seed}`, mimeType: 'image/png', size: 1000 };
}

module.exports = { wallet, tx, art };
