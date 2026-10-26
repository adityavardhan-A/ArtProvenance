/**
 * Blocks: a header that commits to everything, plus the transactions.
 *
 *   hash = SHA-256( canonical(header) )
 *   header = { index, timestamp, previousHash, merkleRoot, difficulty, nonce, miner }
 *
 * previousHash chains blocks together; merkleRoot commits to the transactions;
 * nonce is what miners vary until the hash starts with `difficulty` zeros.
 */
const config = require('./config');
const { sha256, canonical } = require('./crypto');
const { merkleRoot } = require('./merkle');

function headerOf(block) {
  return {
    index: block.index,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    merkleRoot: block.merkleRoot,
    difficulty: block.difficulty,
    nonce: block.nonce,
    miner: block.miner,
  };
}

function computeBlockHash(block) {
  return sha256(canonical(headerOf(block)));
}

function meetsDifficulty(hash, difficulty) {
  return hash.startsWith('0'.repeat(difficulty));
}

/** Expected number of hashes to find a block at this difficulty. */
function workOf(difficulty) {
  return 16 ** difficulty;
}

function txRoot(transactions) {
  return merkleRoot(transactions.map((t) => t.id));
}

/** Identical on every node: no PoW, no transactions, fixed timestamp. */
function createGenesisBlock() {
  const block = {
    index: 0,
    timestamp: config.GENESIS_TIMESTAMP,
    previousHash: '0'.repeat(64),
    merkleRoot: txRoot([]),
    difficulty: 0,
    nonce: 0,
    miner: config.GENESIS_MESSAGE,
    transactions: [],
  };
  block.hash = computeBlockHash(block);
  return block;
}

/**
 * Proof-of-work search, run in slices so the server keeps answering requests
 * while it mines. `shouldAbort` is polled between slices — a node stops when a
 * peer's block arrives first.
 */
async function mine(template, { shouldAbort = () => false, slice = 4000, onProgress } = {}) {
  const block = { ...template, nonce: 0 };
  const target = '0'.repeat(block.difficulty);
  const started = Date.now();

  for (;;) {
    for (let i = 0; i < slice; i++) {
      const hash = computeBlockHash(block);
      if (hash.startsWith(target)) {
        block.hash = hash;
        return { block, attempts: block.nonce + 1, ms: Date.now() - started };
      }
      block.nonce++;
    }
    if (onProgress) onProgress(block.nonce);
    if (shouldAbort()) return null;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

module.exports = {
  headerOf,
  computeBlockHash,
  meetsDifficulty,
  workOf,
  txRoot,
  createGenesisBlock,
  mine,
};
