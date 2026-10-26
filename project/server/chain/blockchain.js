/**
 * The ledger: chain of blocks, mempool, mining, validation and fork choice.
 */
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const config = require('./config');
const { sha256, canonical } = require('./crypto');
const { validateTransaction, computeTxId } = require('./transaction');
const { RegistryState, RuleError } = require('./state');
const { merkleProof, merkleLevels } = require('./merkle');
const {
  computeBlockHash,
  meetsDifficulty,
  workOf,
  txRoot,
  createGenesisBlock,
  mine,
  headerOf,
} = require('./block');

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Every check one block must pass, given its parent and the state before it.
 * Returns the problems found (empty = valid) and, if valid, the state after.
 */
function checkBlock(block, prev, stateBefore, { now = Date.now(), skipRules = false } = {}) {
  const problems = [];
  const checks = { link: true, hash: true, pow: true, merkle: true, signatures: true, rules: true, time: true };
  const fail = (key, msg) => {
    checks[key] = false;
    problems.push(msg);
  };

  if (!block || typeof block !== 'object' || !Array.isArray(block.transactions)) {
    return { ok: false, problems: ['Block is malformed.'], checks, nextState: null };
  }

  if (block.index !== prev.index + 1) fail('link', `Index ${block.index} does not follow ${prev.index}.`);
  if (block.previousHash !== prev.hash) {
    fail('link', `previousHash ${short(block.previousHash)} does not match block #${prev.index}'s hash ${short(prev.hash)}.`);
  }

  const recomputed = computeBlockHash(block);
  if (block.hash !== recomputed) {
    fail('hash', `Stored hash ${short(block.hash)} does not match the header, which hashes to ${short(recomputed)}.`);
  }

  if (!Number.isInteger(block.difficulty) || block.difficulty < config.MIN_DIFFICULTY || block.difficulty > config.MAX_DIFFICULTY) {
    fail('pow', `Difficulty ${block.difficulty} is outside the allowed ${config.MIN_DIFFICULTY}–${config.MAX_DIFFICULTY}.`);
  } else if (!meetsDifficulty(recomputed, block.difficulty)) {
    fail('pow', `Hash ${short(recomputed)} does not start with ${block.difficulty} zeros, so no proof-of-work was done.`);
  }

  if (!Number.isInteger(block.timestamp) || block.timestamp < prev.timestamp) {
    fail('time', 'Timestamp is earlier than the previous block.');
  } else if (block.timestamp > now + config.MAX_FUTURE_DRIFT_MS) {
    fail('time', 'Timestamp is too far in the future.');
  }

  if (block.transactions.length > config.MAX_TX_PER_BLOCK) {
    fail('rules', `Block holds ${block.transactions.length} transactions; the limit is ${config.MAX_TX_PER_BLOCK}.`);
  }

  const ids = block.transactions.map((t) => (t && t.id) || '');
  if (new Set(ids).size !== ids.length) fail('rules', 'Block contains the same transaction twice.');

  if (block.merkleRoot !== txRoot(block.transactions)) {
    fail('merkle', 'Merkle root does not match the transactions — a transaction was added, removed or altered.');
  }

  for (const tx of block.transactions) {
    const err = validateTransaction(tx);
    if (err) fail('signatures', `Transaction ${short(tx && tx.id)}: ${err}.`);
    else if (tx.timestamp > block.timestamp + config.MAX_FUTURE_DRIFT_MS) {
      fail('time', `Transaction ${short(tx.id)} is dated after its block.`);
    }
  }

  let nextState = null;
  if (!problems.length && !skipRules) {
    nextState = stateBefore.clone();
    const ctx = { index: block.index, hash: block.hash, timestamp: block.timestamp };
    for (const tx of block.transactions) {
      try {
        nextState.apply(tx, ctx);
      } catch (e) {
        fail('rules', `Transaction ${short(tx.id)} breaks a registry rule: ${e.message}`);
        nextState = null;
        break;
      }
    }
  }

  return { ok: problems.length === 0, problems, checks, nextState };
}

function short(h) {
  return typeof h === 'string' ? h.slice(0, 12) + '…' : String(h);
}

/**
 * Validate a whole chain from genesis. Reports every block (structural checks
 * keep running after the first failure, so a tampered block's effect on its
 * successors is visible), and returns the final state if valid.
 */
function validateChain(blocks, { now = Date.now() } = {}) {
  const genesis = createGenesisBlock();
  const report = { valid: true, height: blocks.length - 1, firstInvalid: null, blocks: [], state: null, counts: {} };
  let txCount = 0;

  if (!Array.isArray(blocks) || !blocks.length) {
    return { ...report, valid: false, firstInvalid: 0, height: -1, blocks: [{ index: 0, ok: false, problems: ['Chain is empty.'] }] };
  }

  const genesisOk = blocks[0].hash === genesis.hash && computeBlockHash(blocks[0]) === genesis.hash;
  report.blocks.push({
    index: 0,
    hash: blocks[0].hash,
    ok: genesisOk,
    problems: genesisOk ? [] : ['Genesis block differs from the protocol genesis.'],
    checks: { link: genesisOk, hash: genesisOk, pow: true, merkle: genesisOk, signatures: true, rules: true, time: true },
  });
  if (!genesisOk) {
    report.valid = false;
    report.firstInvalid = 0;
  }

  let state = new RegistryState();
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const stillValid = report.valid;
    const result = checkBlock(block, blocks[i - 1], state, { now, skipRules: !stillValid });
    txCount += (block.transactions || []).length;
    report.blocks.push({ index: i, hash: block.hash, ok: result.ok, problems: result.problems, checks: result.checks });
    if (!result.ok && report.valid) {
      report.valid = false;
      report.firstInvalid = i;
    }
    if (result.ok && result.nextState) state = result.nextState;
  }

  report.counts = { blocks: blocks.length, transactions: txCount };
  if (report.valid) report.state = state;
  return report;
}

function chainWork(blocks) {
  return blocks.reduce((sum, b) => sum + (b.index === 0 ? 0 : workOf(b.difficulty)), 0);
}

class Blockchain extends EventEmitter {
  constructor({ dataDir = null, difficulty = config.DEFAULT_DIFFICULTY, minerAddress = 'unknown', log = () => {} } = {}) {
    super();
    this.dataDir = dataDir;
    this.difficulty = Math.min(config.MAX_DIFFICULTY, Math.max(config.MIN_DIFFICULTY, difficulty));
    this.minerAddress = minerAddress;
    this.log = log;

    this.blocks = [createGenesisBlock()];
    this.state = new RegistryState();
    this.mempool = new Map();
    this.txIndex = new Map();
    this.addressIndex = new Map();

    this.mining = false;
    this.miningProgress = 0;
    this.stats = { lastBlock: null, blocksMinedHere: 0, totalAttempts: 0, totalMs: 0 };
  }

  get tip() {
    return this.blocks[this.blocks.length - 1];
  }

  get height() {
    return this.tip.index;
  }

  get work() {
    return chainWork(this.blocks);
  }

  // --------------------------------------------------------------- indexes

  rebuildIndexes() {
    this.txIndex.clear();
    this.addressIndex.clear();
    for (const block of this.blocks) this.indexBlock(block);
  }

  indexBlock(block) {
    for (const tx of block.transactions) {
      this.txIndex.set(tx.id, block.index);
      const involved = new Set([tx.from]);
      if (tx.type === 'TRANSFER') involved.add(tx.payload.to);
      for (const addr of involved) {
        if (!this.addressIndex.has(addr)) this.addressIndex.set(addr, []);
        this.addressIndex.get(addr).push(tx.id);
      }
    }
  }

  // ----------------------------------------------------------- transactions

  /** State as it would be if every mempool transaction were mined now. */
  pendingState() {
    const s = this.state.clone();
    const ctx = { index: this.height + 1, hash: 'pending', timestamp: Date.now() };
    for (const tx of this.mempool.values()) {
      try {
        s.apply(tx, ctx);
      } catch {
        /* will be pruned */
      }
    }
    return s;
  }

  addTransaction(tx) {
    const err = validateTransaction(tx);
    if (err) return { ok: false, code: 'INVALID_TX', error: err };

    if (this.mempool.has(tx.id)) return { ok: true, duplicate: true };
    if (this.txIndex.has(tx.id)) return { ok: false, code: 'DUPLICATE_TX', error: 'This transaction is already on the chain.' };

    const now = Date.now();
    if (tx.timestamp > now + config.MAX_FUTURE_DRIFT_MS) return { ok: false, code: 'FUTURE_TX', error: 'Transaction is dated in the future. Check your computer clock.' };
    if (tx.timestamp < now - config.MAX_TX_AGE_MS) return { ok: false, code: 'STALE_TX', error: 'Transaction is too old; sign it again.' };

    try {
      this.pendingState().apply(tx, { index: this.height + 1, hash: 'pending', timestamp: now });
    } catch (e) {
      if (e instanceof RuleError) return { ok: false, code: e.code, error: e.message, details: e.details };
      throw e;
    }

    this.mempool.set(tx.id, tx);
    this.saveMempool();
    this.emit('tx', tx);
    return { ok: true };
  }

  /** Drop mempool entries that were mined or have become invalid. */
  pruneMempool() {
    const s = this.state.clone();
    const ctx = { index: this.height + 1, hash: 'pending', timestamp: Date.now() };
    for (const [id, tx] of this.mempool) {
      if (this.txIndex.has(id)) {
        this.mempool.delete(id);
        continue;
      }
      try {
        s.apply(tx, ctx);
      } catch {
        this.mempool.delete(id);
      }
    }
    this.saveMempool();
  }

  // ----------------------------------------------------------------- mining

  /**
   * Mine one block from the mempool. Returns the mined block, or null if
   * there was nothing to mine or a peer's block arrived first.
   */
  async mineBlock() {
    if (this.mining) return null;
    this.pruneMempool();
    const transactions = [...this.mempool.values()].slice(0, config.MAX_TX_PER_BLOCK);
    if (!transactions.length) return null;

    this.mining = true;
    this.miningProgress = 0;
    const parent = this.tip;
    try {
      const template = {
        index: parent.index + 1,
        timestamp: Math.max(Date.now(), parent.timestamp),
        previousHash: parent.hash,
        merkleRoot: txRoot(transactions),
        difficulty: this.difficulty,
        miner: this.minerAddress,
        transactions,
      };
      this.log(`mining block #${template.index} with ${transactions.length} tx at difficulty ${this.difficulty}…`);

      const result = await mine(template, {
        shouldAbort: () => this.tip.hash !== parent.hash,
        onProgress: (n) => (this.miningProgress = n),
      });
      if (!result) {
        this.log(`stopped mining #${template.index}: a peer's block arrived first`);
        return null;
      }

      const added = this.addBlock(result.block, { source: 'local' });
      if (!added.ok) {
        this.log(`mined block rejected by own validation: ${added.error}`);
        return null;
      }

      this.stats.lastBlock = { index: result.block.index, attempts: result.attempts, ms: result.ms };
      this.stats.blocksMinedHere++;
      this.stats.totalAttempts += result.attempts;
      this.stats.totalMs += result.ms;
      this.log(`⛏  mined #${result.block.index} ${result.block.hash.slice(0, 16)}… nonce ${result.block.nonce} in ${result.ms} ms`);
      this.emit('mined', result.block);
      return result.block;
    } finally {
      this.mining = false;
      this.miningProgress = 0;
    }
  }

  // ----------------------------------------------------------------- blocks

  hasBlock(hash) {
    return this.blocks.some((b) => b.hash === hash);
  }

  /** Append a block that extends our tip. */
  addBlock(block, { source = 'peer' } = {}) {
    if (!block || typeof block !== 'object') return { ok: false, code: 'MALFORMED', error: 'Not a block.' };
    if (this.hasBlock(block.hash)) return { ok: false, code: 'KNOWN', error: 'Already have this block.' };
    if (block.index > this.height + 1) return { ok: false, code: 'AHEAD', error: 'Block is ahead of our chain; need to sync.' };
    if (block.index <= this.height) return { ok: false, code: 'FORK', error: 'Block is on a competing branch.' };

    const result = checkBlock(block, this.tip, this.state);
    if (!result.ok) return { ok: false, code: 'INVALID_BLOCK', error: result.problems.join(' ') };

    this.blocks.push(block);
    this.state = result.nextState;
    this.indexBlock(block);
    for (const tx of block.transactions) this.mempool.delete(tx.id);
    this.pruneMempool();
    this.save();
    this.emit('block', block, source);
    return { ok: true };
  }

  /**
   * Fork choice: adopt `candidate` if it is valid and carries more total
   * proof-of-work than ours (ties go to the lower tip hash, so every node
   * picks the same branch). Transactions only in the losing branch go back to
   * the mempool.
   */
  replaceChain(candidate, { source = 'peer' } = {}) {
    const report = validateChain(candidate);
    if (!report.valid) {
      return { replaced: false, reason: `Candidate chain invalid at block #${report.firstInvalid}.` };
    }

    const ours = this.work;
    const theirs = chainWork(candidate);
    const tieWin = theirs === ours && candidate[candidate.length - 1].hash < this.tip.hash;
    if (!(theirs > ours || tieWin)) return { replaced: false, reason: 'Candidate chain has no more work than ours.' };

    const keep = new Set(candidate.flatMap((b) => b.transactions.map((t) => t.id)));
    const orphaned = this.blocks.flatMap((b) => b.transactions).filter((t) => !keep.has(t.id));
    // First height where the two chains differ (or where ours simply ended).
    const diverge = this.blocks.findIndex((b, i) => !candidate[i] || candidate[i].hash !== b.hash);
    const forkPoint = diverge === -1 ? this.blocks.length : diverge;

    this.blocks = candidate;
    this.state = report.state;
    this.rebuildIndexes();
    for (const tx of orphaned) this.mempool.set(tx.id, tx);
    this.pruneMempool();
    this.save();

    this.log(`reorg: adopted chain of height ${this.height} from ${source} (fork at #${forkPoint}, ${orphaned.length} tx returned to mempool)`);
    this.emit('reorg', { height: this.height, forkPoint, orphaned: orphaned.length });
    return { replaced: true, forkPoint, orphaned: orphaned.length };
  }

  validate() {
    const report = validateChain(this.blocks);
    delete report.state;
    return report;
  }

  // ------------------------------------------------------------ persistence

  file(name) {
    return path.join(this.dataDir, name);
  }

  writeJson(name, value) {
    if (!this.dataDir) return;
    const data = JSON.stringify(value);
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const tmp = this.file(name + '.tmp');
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, this.file(name));
    } catch (e) {
      // Windows (and OneDrive in particular) can briefly lock a file and make
      // the atomic rename fail. Fall back to a direct write rather than lose
      // the save or crash the request.
      try {
        fs.writeFileSync(this.file(name), data);
      } catch (e2) {
        this.log(`⚠ could not save ${name}: ${e2.message}`);
      }
    }
  }

  save() {
    this.writeJson('chain.json', this.blocks);
  }

  saveMempool() {
    this.writeJson('mempool.json', [...this.mempool.values()]);
  }

  /** Load and fully re-validate the chain stored on disk. */
  load() {
    if (!this.dataDir) return;
    const chainFile = this.file('chain.json');
    if (fs.existsSync(chainFile)) {
      try {
        const blocks = JSON.parse(fs.readFileSync(chainFile, 'utf8'));
        const report = validateChain(blocks);
        if (report.valid) {
          this.blocks = blocks;
          this.state = report.state;
          this.rebuildIndexes();
          this.log(`loaded chain from disk: height ${this.height}, all ${blocks.length} blocks re-validated`);
        } else {
          const quarantine = this.file(`chain.invalid-${Date.now()}.json`);
          fs.renameSync(chainFile, quarantine);
          this.log(`⚠ chain on disk failed validation at block #${report.firstInvalid}: ${report.blocks[report.firstInvalid].problems[0]}`);
          this.log(`  moved it to ${path.basename(quarantine)} and started from genesis; peers will resync us`);
        }
      } catch (e) {
        this.log(`⚠ could not read chain.json (${e.message}); starting from genesis`);
      }
    }

    const mempoolFile = this.file('mempool.json');
    if (fs.existsSync(mempoolFile)) {
      try {
        for (const tx of JSON.parse(fs.readFileSync(mempoolFile, 'utf8'))) this.addTransaction(tx);
      } catch {
        /* a bad mempool file is not worth stopping for */
      }
    }
    this.save();
  }

  // ---------------------------------------------------------------- queries

  getBlock(id) {
    if (/^\d+$/.test(String(id))) return this.blocks[Number(id)] || null;
    return this.blocks.find((b) => b.hash === id) || null;
  }

  summary(block) {
    return {
      ...headerOf(block),
      hash: block.hash,
      txCount: block.transactions.length,
      types: block.transactions.map((t) => t.type),
      confirmations: this.height - block.index + 1,
    };
  }

  blockSummaries({ before = this.height + 1, limit = 20 } = {}) {
    const end = Math.min(before, this.blocks.length);
    const start = Math.max(0, end - limit);
    return this.blocks.slice(start, end).reverse().map((b) => this.summary(b));
  }

  getTransaction(id) {
    if (this.mempool.has(id)) return { tx: this.mempool.get(id), status: 'pending', confirmations: 0 };
    if (!this.txIndex.has(id)) return null;
    const block = this.blocks[this.txIndex.get(id)];
    return {
      tx: block.transactions.find((t) => t.id === id),
      status: 'confirmed',
      blockIndex: block.index,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      confirmations: this.height - block.index + 1,
    };
  }

  getProof(id) {
    if (!this.txIndex.has(id)) return null;
    const block = this.blocks[this.txIndex.get(id)];
    const leaves = block.transactions.map((t) => t.id);
    return {
      txId: id,
      blockIndex: block.index,
      blockHash: block.hash,
      header: headerOf(block),
      leafCount: leaves.length,
      proof: merkleProof(leaves, id),
      confirmations: this.height - block.index + 1,
    };
  }

  merkleTree(blockId) {
    const block = this.getBlock(blockId);
    if (!block) return null;
    return merkleLevels(block.transactions.map((t) => t.id));
  }

  nameOf(address) {
    const id = this.state.identities.get(address);
    return id ? id.name : null;
  }

  artworkView(art) {
    return {
      ...art,
      creatorName: this.nameOf(art.creator),
      ownerName: this.nameOf(art.owner),
      confirmations: this.height - art.block + 1,
      history: art.history.map((h) => ({ ...h, fromName: h.from ? this.nameOf(h.from) : null, toName: this.nameOf(h.to) })),
      reports: art.reports.map((r) => ({ ...r, reporterName: this.nameOf(r.reporter) })),
    };
  }

  listArtworks() {
    return [...this.state.artworks.values()]
      .sort((a, b) => b.registeredAt - a.registeredAt)
      .map((a) => this.artworkView(a));
  }

  getArtwork(fileHash) {
    const art = this.state.artworks.get(fileHash);
    return art ? this.artworkView(art) : null;
  }

  similar(perceptualHash, maxBits = 20, excludeHash = null) {
    return this.state.similar(perceptualHash, maxBits, excludeHash).map((m) => ({
      distance: m.distance,
      artwork: this.artworkView(m.artwork),
    }));
  }

  account(address) {
    const txIds = this.addressIndex.get(address) || [];
    const pending = [...this.mempool.values()].filter((t) => t.from === address || (t.payload && t.payload.to === address));
    return {
      address,
      name: this.nameOf(address),
      identity: this.state.identities.get(address) || null,
      owned: this.listArtworks().filter((a) => a.owner === address),
      created: this.listArtworks().filter((a) => a.creator === address),
      transactions: txIds
        .slice(-50)
        .reverse()
        .map((id) => this.getTransaction(id)),
      pending: pending.map((tx) => ({ tx, status: 'pending', confirmations: 0 })),
    };
  }

  // ------------------------------------------------------------- tamper lab

  /**
   * Show why history can't be rewritten. Works on copies of the chain; the
   * real chain is never touched.
   */
  async tamperDemo(requestedIndex) {
    const candidates = this.blocks.filter((b) => b.index > 0 && b.transactions.length);
    if (!candidates.length) return { error: 'Register at least one artwork first, so there is a block with data to tamper with.' };
    // Default to the latest registration: renaming an artwork is the forgery people picture.
    const registrations = candidates.filter((b) => b.transactions[0].type === 'REGISTER');
    const target =
      candidates.find((b) => b.index === Number(requestedIndex)) ||
      registrations[registrations.length - 1] ||
      candidates[candidates.length - 1];
    const i = target.index;
    const tx0 = target.transactions[0];

    const forge = (tx) => {
      const p = tx.payload;
      if (p.title) return { field: 'title', before: p.title, after: p.title + ' (forged)' };
      if (p.name) return { field: 'name', before: p.name, after: 'Mallory' };
      if (p.to) return { field: 'to', label: 'recipient', before: p.to, after: 'ac' + 'f'.repeat(40) };
      return { field: 'note', before: p.note || '', after: 'forged' };
    };
    const edit = forge(tx0);

    const firstProblem = (report) => {
      const bad = report.blocks.filter((b) => !b.ok);
      return {
        valid: report.valid,
        firstInvalid: report.firstInvalid,
        brokenBlocks: bad.map((b) => b.index),
        problems: bad.slice(0, 3).map((b) => ({ index: b.index, problems: b.problems })),
      };
    };

    // 1. Change the data and nothing else.
    const a = clone(this.blocks);
    a[i].transactions[0].payload[edit.field] = edit.after;

    // 2. Also recompute the tx id, Merkle root and block hash (no new PoW).
    const b = clone(this.blocks);
    const btx = b[i].transactions[0];
    btx.payload[edit.field] = edit.after;
    btx.id = computeTxId(btx);
    b[i].merkleRoot = txRoot(b[i].transactions);
    b[i].hash = computeBlockHash(b[i]);

    // 3. Also redo the proof-of-work for that block.
    const c = clone(b);
    const remined = await mine({ ...c[i], nonce: 0 });
    c[i] = remined.block;

    const later = this.height - i;
    return {
      target: { index: i, hash: target.hash, txId: tx0.id, type: tx0.type },
      edit,
      scenarios: [
        {
          key: 'edit',
          title: `Change the ${edit.label || edit.field} in block #${i}`,
          what: `Edit "${edit.before}" to "${edit.after}" inside the stored transaction and leave everything else alone.`,
          result: firstProblem(validateChain(a)),
        },
        {
          key: 'rehash',
          title: 'Also recompute the transaction id, Merkle root and block hash',
          what: 'Cover the tracks by recalculating every hash that depended on the edit — without redoing proof-of-work.',
          result: firstProblem(validateChain(b)),
        },
        {
          key: 'remine',
          title: `Also redo block #${i}'s proof-of-work`,
          what: `Spend ${remined.attempts.toLocaleString()} hashes (${remined.ms} ms) re-mining the block so its hash has the required zeros again.`,
          result: firstProblem(validateChain(c)),
          note:
            later > 0
              ? `To finish the forgery the attacker would have to re-mine all ${later} later block${later === 1 ? '' : 's'} and outpace the honest nodes — and still could not fake the artist's signature.`
              : 'The forged transaction still carries the original signature, which no longer matches — the attacker cannot sign as the artist without their private key.',
        },
      ],
      realChainValid: validateChain(this.blocks).valid,
    };
  }

  status() {
    const s = this.stats;
    return {
      chain: config.CHAIN_NAME,
      height: this.height,
      tipHash: this.tip.hash,
      tipTimestamp: this.tip.timestamp,
      genesisHash: this.blocks[0].hash,
      difficulty: this.difficulty,
      cumulativeWork: this.work,
      transactions: this.txIndex.size,
      artworks: this.state.artworks.size,
      identities: this.state.identities.size,
      mempool: this.mempool.size,
      mining: {
        active: this.mining,
        progress: this.miningProgress,
        lastBlock: s.lastBlock,
        blocksMinedHere: s.blocksMinedHere,
        hashRate: s.totalMs ? Math.round((s.totalAttempts / s.totalMs) * 1000) : null,
      },
      rules: {
        minDifficulty: config.MIN_DIFFICULTY,
        maxDifficulty: config.MAX_DIFFICULTY,
        maxTxPerBlock: config.MAX_TX_PER_BLOCK,
        nearDuplicateBits: config.NEAR_DUPLICATE_BITS,
      },
    };
  }
}

module.exports = { Blockchain, validateChain, checkBlock, chainWork, sha256, canonical };
