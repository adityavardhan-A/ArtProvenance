/**
 * Merkle tree over a block's transaction ids.
 *
 * The root goes in the block header, so changing any transaction changes the
 * root, which changes the block hash, which breaks proof-of-work and the link
 * from the next block. A Merkle proof lets anyone check that one transaction
 * is in a block using only log2(n) hashes, without downloading the block.
 *
 * Construction (same as Bitcoin): pair hashes left to right, hash each pair's
 * concatenation, duplicate the last hash when a level has an odd count.
 */
const { sha256 } = require('./crypto');

const EMPTY_ROOT = sha256('');

function nextLevel(level) {
  const out = [];
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i];
    const right = i + 1 < level.length ? level[i + 1] : level[i];
    out.push(sha256(left + right));
  }
  return out;
}

/** Every level of the tree, leaves first, root last. */
function merkleLevels(leaves) {
  if (!leaves.length) return [[EMPTY_ROOT]];
  const levels = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    levels.push(nextLevel(levels[levels.length - 1]));
  }
  return levels;
}

function merkleRoot(leaves) {
  const levels = merkleLevels(leaves);
  return levels[levels.length - 1][0];
}

/**
 * Sibling path from a leaf to the root. Each step says whether the sibling
 * sits to the left or right of the running hash.
 */
function merkleProof(leaves, leaf) {
  let index = leaves.indexOf(leaf);
  if (index < 0) return null;

  const levels = merkleLevels(leaves);
  const proof = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : Math.min(index + 1, level.length - 1);
    proof.push({ hash: level[siblingIndex], position: isRight ? 'left' : 'right' });
    index = Math.floor(index / 2);
  }
  return proof;
}

function verifyMerkleProof(leaf, proof, root) {
  let running = leaf;
  for (const step of proof) {
    running = step.position === 'left' ? sha256(step.hash + running) : sha256(running + step.hash);
  }
  return running === root;
}

module.exports = { merkleRoot, merkleLevels, merkleProof, verifyMerkleProof, EMPTY_ROOT };
