/**
 * ArtChain node.
 *
 *   node server.js --port 4001 --name node-1 --peers http://localhost:4002,http://localhost:4003
 *
 * Options
 *   --port <n>          HTTP port (default 4001)
 *   --name <s>          node name shown in logs and the explorer
 *   --peers <urls>      comma-separated peer URLs to join
 *   --difficulty <n>    proof-of-work zeros this node mines at (3–7, default 4)
 *   --data <dir>        where the chain, mempool, files and node key live
 *   --no-mine           validate and relay only; never mine
 *
 * Runs entirely on your machine. No cryptocurrency, fees or external network.
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');

const config = require('./chain/config');
const { Blockchain } = require('./chain/blockchain');
const { FileStore } = require('./chain/filestore');
const { P2P } = require('./chain/p2p');
const { generateKeyPair } = require('./chain/crypto');

// ------------------------------------------------------------------ options

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key.startsWith('no-')) out[key.slice(3)] = false;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.PORT || 4001);
const NAME = args.name || `node-${PORT}`;
const SELF_URL = args.url || `http://localhost:${PORT}`;
const PEERS = String(args.peers || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DATA_DIR = path.resolve(args.data || path.join(__dirname, 'data', NAME));
const DIFFICULTY = Number(args.difficulty || config.DEFAULT_DIFFICULTY);
const MINE = args.mine !== false;

const log = (...m) => console.log(`[${NAME}]`, ...m);

// -------------------------------------------------------------- node identity

/** Each node has its own key pair; its address is recorded as block miner. */
function loadNodeKey() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, 'node-key.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = generateKeyPair();
  fs.writeFileSync(file, JSON.stringify(key, null, 2));
  return key;
}

const nodeKey = loadNodeKey();
const chain = new Blockchain({ dataDir: DATA_DIR, difficulty: DIFFICULTY, minerAddress: nodeKey.address, log });
chain.load();
const files = new FileStore(path.join(DATA_DIR, 'files'), { log });
const p2p = new P2P({ chain, files, selfUrl: SELF_URL, peers: PEERS, log });

// ------------------------------------------------------------------- mining

/**
 * Mine shortly after transactions arrive. The random delay batches several
 * transactions per block and staggers nodes, so they rarely find competing
 * blocks at the same moment (and when they do, fork choice resolves it).
 */
let mineTimer = null;
function scheduleMining() {
  if (!MINE || mineTimer || chain.mining || !chain.mempool.size) return;
  mineTimer = setTimeout(async () => {
    mineTimer = null;
    const block = await chain.mineBlock();
    if (block) p2p.broadcastBlock(block);
    if (chain.mempool.size) scheduleMining();
  }, 800 + Math.floor(Math.random() * 1700));
}

chain.on('tx', scheduleMining);
chain.on('reorg', scheduleMining);
// Whoever mined it, make sure we hold every image the new block references.
chain.on('block', (block) => p2p.replicateFiles(block));

// ---------------------------------------------------------------------- api

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const peerOf = (req) => req.get('x-artchain-peer') || null;
const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

app.get('/', (_req, res) => res.json({ name: config.CHAIN_NAME, node: NAME, docs: 'GET /status' }));

app.get('/status', (_req, res) => {
  res.json({
    node: { name: NAME, url: SELF_URL, address: nodeKey.address, mining: MINE, files: files.count() },
    ...chain.status(),
    peers: p2p.status(),
  });
});

// Blocks
app.get('/blocks', (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const before = req.query.before !== undefined ? Number(req.query.before) : undefined;
  res.json({ height: chain.height, blocks: chain.blockSummaries({ before, limit }) });
});

app.get('/blocks/:id', (req, res) => {
  const block = chain.getBlock(req.params.id);
  if (!block) return notFound(res, 'Block');
  res.json({ ...block, confirmations: chain.height - block.index + 1, merkleLevels: chain.merkleTree(block.index) });
});

// Transactions
app.post('/tx', (req, res) => {
  const result = chain.addTransaction(req.body);
  if (!result.ok) return res.status(400).json({ error: result.error, code: result.code, details: result.details });
  if (!result.duplicate) {
    log(`tx ${req.body.type} ${req.body.id.slice(0, 12)}… from ${req.body.from.slice(0, 10)}… entered mempool`);
    p2p.broadcastTx(req.body);
  }
  res.status(202).json({ id: req.body.id, status: 'pending' });
});

app.get('/tx/:id', (req, res) => {
  const found = chain.getTransaction(req.params.id);
  return found ? res.json(found) : notFound(res, 'Transaction');
});

app.get('/tx/:id/proof', (req, res) => {
  const proof = chain.getProof(req.params.id);
  return proof ? res.json(proof) : notFound(res, 'Confirmed transaction');
});

app.get('/mempool', (_req, res) => res.json({ size: chain.mempool.size, transactions: [...chain.mempool.values()] }));

// Registry views (derived from chain state)
app.get('/artworks', (_req, res) => res.json({ height: chain.height, artworks: chain.listArtworks() }));

app.get('/artworks/:hash', (req, res) => {
  const art = chain.getArtwork(req.params.hash);
  return art ? res.json(art) : notFound(res, 'Artwork');
});

app.get('/similar/:phash', (req, res) => {
  if (!/^[0-9a-f]{16}$/.test(req.params.phash)) return res.status(400).json({ error: 'perceptual hash must be 16 hex chars' });
  const max = Math.min(32, Number(req.query.max) || 20);
  res.json({ matches: chain.similar(req.params.phash, max, req.query.exclude || null).slice(0, 10) });
});

app.get('/accounts/:address', (req, res) => res.json(chain.account(req.params.address)));

app.get('/identities', (_req, res) => {
  res.json({
    identities: [...chain.state.identities.entries()].map(([address, id]) => ({ address, ...id })),
  });
});

// Chain integrity
app.get('/chain/validate', (_req, res) => res.json(chain.validate()));

app.post('/chain/tamper-demo', async (req, res) => {
  res.json(await chain.tamperDemo(req.body && req.body.index));
});

app.post('/mine', async (_req, res) => {
  if (!chain.mempool.size) return res.json({ mined: false, reason: 'Mempool is empty — nothing to mine.' });
  const block = await chain.mineBlock();
  if (!block) return res.json({ mined: false, reason: 'Mining is already running or a peer won this round.' });
  p2p.broadcastBlock(block);
  res.json({ mined: true, block: chain.summary(block), stats: chain.stats.lastBlock });
});

// Content-addressed files
app.post('/files', express.raw({ type: () => true, limit: config.MAX_FILE_BYTES }), (req, res) => {
  try {
    const type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const stored = files.put(req.body, type);
    res.status(201).json(stored);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/files/:hash', async (req, res) => {
  const { hash } = req.params;
  if (!files.has(hash) && !req.get('x-artchain-peer-fetch')) {
    await files.fetchFromPeers(hash, p2p.list());
  }
  const file = files.get(hash);
  if (!file) return notFound(res, 'File');
  res.set('content-type', file.mimeType);
  res.set('cache-control', 'public, max-age=31536000, immutable');
  res.set('x-content-sha256', hash);
  res.send(file.buffer);
});

// Peer protocol
app.post('/p2p/hello', (req, res) => {
  p2p.addPeer(req.body && req.body.url);
  res.json({ name: NAME, peers: p2p.list(), height: chain.height });
});

app.get('/p2p/tip', (_req, res) => {
  res.json({ name: NAME, height: chain.height, tipHash: chain.tip.hash, work: chain.work, peers: [SELF_URL, ...p2p.list()] });
});

app.get('/p2p/chain', (_req, res) => res.json({ blocks: chain.blocks }));

app.post('/p2p/tx', (req, res) => {
  const result = chain.addTransaction(req.body);
  if (result.ok && !result.duplicate) p2p.broadcastTx(req.body, peerOf(req));
  res.json({ ok: result.ok, code: result.code });
});

app.post('/p2p/block', async (req, res) => {
  const result = await p2p.receiveBlock(req.body, peerOf(req));
  res.json({ ok: result.ok, code: result.code });
});

app.use((err, _req, res, _next) => {
  const status = err.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({ error: err.message || 'Bad request' });
});

// ------------------------------------------------------------------- start

const server = app.listen(PORT, async () => {
  log(`${config.CHAIN_NAME} node listening on ${SELF_URL}`);
  log(`  data:       ${DATA_DIR}`);
  log(`  address:    ${nodeKey.address}`);
  log(`  height:     ${chain.height} (genesis ${chain.blocks[0].hash.slice(0, 16)}…)`);
  log(`  difficulty: ${chain.difficulty} leading zeros${MINE ? '' : ' (not mining)'}`);
  log(`  peers:      ${PEERS.length ? PEERS.join(', ') : 'none'}`);
  await p2p.start();
  scheduleMining();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[${NAME}] Port ${PORT} is already in use. ArtChain is probably already running in another terminal — close that one first (Ctrl+C), or pick another port with --port.`);
  } else {
    console.error(`[${NAME}] Could not start: ${err.message}`);
  }
  process.exit(1);
});
