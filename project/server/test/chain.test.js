const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Blockchain, validateChain } = require('../chain/blockchain');
const { merkleRoot, merkleProof, verifyMerkleProof } = require('../chain/merkle');
const { computeTxId, validateTransaction } = require('../chain/transaction');
const { sha256, canonical } = require('../chain/crypto');
const { createGenesisBlock } = require('../chain/block');
const { wallet, tx, art } = require('./helpers');

const newChain = (opts = {}) => new Blockchain({ difficulty: 3, minerAddress: 'test-miner', ...opts });

async function submitAndMine(chain, t) {
  const r = chain.addTransaction(t);
  assert.ok(r.ok, r.error);
  const block = await chain.mineBlock();
  assert.ok(block, 'expected a block to be mined');
  return block;
}

// ------------------------------------------------------------------ merkle

test('Merkle proofs verify for every leaf, including odd-sized trees', () => {
  for (const n of [1, 2, 3, 5, 8, 13]) {
    const leaves = Array.from({ length: n }, (_, i) => sha256('leaf' + i));
    const root = merkleRoot(leaves);
    for (const leaf of leaves) {
      assert.ok(verifyMerkleProof(leaf, merkleProof(leaves, leaf), root), `n=${n}`);
    }
    assert.equal(verifyMerkleProof(sha256('intruder'), merkleProof(leaves, leaves[0]), root), false);
  }
});

test('canonical JSON ignores key order', () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }), canonical({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
});

// ------------------------------------------------------------ signatures

test('a signed transaction validates; any edit breaks it', () => {
  const alice = wallet();
  const t = tx(alice, 'REGISTER', art(1));
  assert.equal(validateTransaction(t), null);

  const edited = { ...t, payload: { ...t.payload, title: 'Stolen' } };
  assert.match(validateTransaction(edited), /id does not match/);

  edited.id = computeTxId(edited);
  assert.match(validateTransaction(edited), /signature is invalid/);

  const mallory = wallet();
  const impersonation = { ...t, from: mallory.address };
  assert.match(validateTransaction(impersonation), /from does not match/);
});

// ------------------------------------------------------------ registry rules

test('registering, then refusing exact and near-identical copies by others', async () => {
  const chain = newChain();
  const alice = wallet();
  const bob = wallet();

  await submitAndMine(chain, tx(alice, 'IDENTITY', { name: 'Alice' }));
  await submitAndMine(chain, tx(alice, 'REGISTER', art('sunrise', 'ffff0000ffff0000')));
  assert.equal(chain.getArtwork(art('sunrise').fileHash).ownerName, 'Alice');

  const dup = chain.addTransaction(tx(bob, 'REGISTER', art('sunrise', '0000000000000000')));
  assert.equal(dup.code, 'ALREADY_REGISTERED');

  // Same picture resaved: different bytes, perceptual hash 2 bits away.
  const nearCopy = chain.addTransaction(tx(bob, 'REGISTER', art('sunrise-resaved', 'ffff0000ffff0003')));
  assert.equal(nearCopy.code, 'SUSPECTED_COPY');

  // The original artist may register their own variations.
  const ownVariation = chain.addTransaction(tx(alice, 'REGISTER', art('sunrise-v2', 'ffff0000ffff0003')));
  assert.ok(ownVariation.ok);
});

test('only the owner can transfer, and history records each hand-off', async () => {
  const chain = newChain();
  const alice = wallet();
  const bob = wallet();
  const work = art('portrait');

  await submitAndMine(chain, tx(alice, 'REGISTER', work));

  const theft = chain.addTransaction(tx(bob, 'TRANSFER', { fileHash: work.fileHash, to: bob.address }));
  assert.equal(theft.code, 'NOT_OWNER');

  await submitAndMine(chain, tx(alice, 'TRANSFER', { fileHash: work.fileHash, to: bob.address, note: 'sold' }));
  const record = chain.getArtwork(work.fileHash);
  assert.equal(record.owner, bob.address);
  assert.equal(record.creator, alice.address);
  assert.deepEqual(record.history.map((h) => h.type), ['REGISTER', 'TRANSFER']);
});

test('a replayed transaction is refused', async () => {
  const chain = newChain();
  const alice = wallet();
  const t = tx(alice, 'IDENTITY', { name: 'Alice' });
  await submitAndMine(chain, t);
  assert.equal(chain.addTransaction(t).code, 'DUPLICATE_TX');
});

// ------------------------------------------------------------- tampering

test('editing any confirmed block makes the chain invalid from that block on', async () => {
  const chain = newChain();
  const alice = wallet();
  await submitAndMine(chain, tx(alice, 'REGISTER', art('a')));
  await submitAndMine(chain, tx(alice, 'REGISTER', art('b', '00000000ffffffff')));
  assert.ok(validateChain(chain.blocks).valid);

  const forged = JSON.parse(JSON.stringify(chain.blocks));
  forged[1].transactions[0].payload.title = 'Forged';
  const report = validateChain(forged);
  assert.equal(report.valid, false);
  assert.equal(report.firstInvalid, 1);

  const demo = await chain.tamperDemo(1);
  assert.equal(demo.scenarios.length, 3);
  for (const s of demo.scenarios) assert.equal(s.result.valid, false, s.title);
  // After re-mining block 1, the break shows up as block 2's broken link.
  assert.ok(demo.scenarios[2].result.brokenBlocks.includes(2));
  assert.ok(demo.realChainValid);
});

test('a block without proof-of-work is rejected', async () => {
  const chain = newChain();
  const alice = wallet();
  const t = tx(alice, 'IDENTITY', { name: 'Alice' });
  const lazy = {
    index: 1,
    timestamp: Date.now(),
    previousHash: chain.tip.hash,
    merkleRoot: merkleRoot([t.id]),
    difficulty: 3,
    nonce: 0,
    miner: 'lazy',
    transactions: [t],
  };
  const { computeBlockHash } = require('../chain/block');
  lazy.hash = computeBlockHash(lazy);
  if (lazy.hash.startsWith('000')) return; // astronomically unlikely
  const result = chain.addBlock(lazy);
  assert.equal(result.code, 'INVALID_BLOCK');
  assert.match(result.error, /proof-of-work/);
});

// -------------------------------------------------------------- consensus

test('fork choice adopts the chain with more work and returns orphaned transactions', async () => {
  const a = newChain();
  const b = newChain();
  const alice = wallet();
  const bob = wallet();

  await submitAndMine(a, tx(alice, 'IDENTITY', { name: 'Alice' }));
  await submitAndMine(b, tx(bob, 'IDENTITY', { name: 'Bob' }));
  await submitAndMine(b, tx(bob, 'REGISTER', art('b1')));

  assert.ok(b.work > a.work);
  const result = a.replaceChain(b.blocks);
  assert.ok(result.replaced);
  assert.equal(a.height, 2);
  assert.equal(a.mempool.size, 1, "Alice's identity tx should be back in the mempool");

  // The weaker chain is refused.
  assert.equal(b.replaceChain([createGenesisBlock()]).replaced, false);
});

test('equal-work forks resolve to the same branch on every node', async () => {
  const a = newChain();
  const b = newChain();
  await submitAndMine(a, tx(wallet(), 'IDENTITY', { name: 'A' }));
  await submitAndMine(b, tx(wallet(), 'IDENTITY', { name: 'B' }));
  const aBlocks = a.blocks.slice();
  a.replaceChain(b.blocks);
  b.replaceChain(aBlocks);
  assert.equal(a.tip.hash, b.tip.hash);
});

// ------------------------------------------------------------ persistence

test('a chain edited on disk is detected and quarantined at startup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artchain-'));
  const chain = newChain({ dataDir: dir });
  chain.load();
  await submitAndMine(chain, tx(wallet(), 'REGISTER', art('disk')));

  const reloaded = newChain({ dataDir: dir });
  reloaded.load();
  assert.equal(reloaded.height, 1);

  const file = path.join(dir, 'chain.json');
  const blocks = JSON.parse(fs.readFileSync(file, 'utf8'));
  blocks[1].transactions[0].payload.title = 'Edited in a text editor';
  fs.writeFileSync(file, JSON.stringify(blocks));

  const suspicious = newChain({ dataDir: dir });
  suspicious.load();
  assert.equal(suspicious.height, 0);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('chain.invalid-')));
});
