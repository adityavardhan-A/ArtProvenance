/**
 * Peer-to-peer layer over HTTP.
 *
 *  - Gossip: new transactions and blocks are pushed to every known peer, who
 *    validate them independently and pass them on.
 *  - Discovery: nodes introduce themselves (/p2p/hello) and learn each other's
 *    peers, so a node only needs one address to join.
 *  - Sync: every few seconds each node asks peers for their tip. If a peer
 *    has a chain with more total proof-of-work, the node downloads it,
 *    re-validates every block, and switches (longest-chain consensus).
 */
const SYNC_INTERVAL_MS = 5000;
const TIMEOUT_MS = 3000;

class P2P {
  constructor({ chain, files, selfUrl, peers = [], log = () => {} }) {
    this.chain = chain;
    this.files = files;
    this.selfUrl = selfUrl;
    this.peers = new Set(peers.filter((p) => p && p !== selfUrl));
    this.peerInfo = new Map();
    this.log = log;
    this.timer = null;
  }

  list() {
    return [...this.peers];
  }

  addPeer(url) {
    if (!url || url === this.selfUrl || this.peers.has(url)) return false;
    if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(url)) return false;
    this.peers.add(url);
    this.log(`peer joined: ${url}`);
    return true;
  }

  async request(peer, path, body) {
    const res = await fetch(peer + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-artchain-peer': this.selfUrl },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(path === '/p2p/chain' ? 15000 : TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  /** Push to every peer except the one we heard it from. */
  broadcast(path, body, except) {
    for (const peer of this.peers) {
      if (peer === except) continue;
      this.request(peer, path, body).catch(() => {});
    }
  }

  broadcastTx(tx, except) {
    this.broadcast('/p2p/tx', tx, except);
  }

  broadcastBlock(block, except) {
    this.broadcast('/p2p/block', block, except);
  }

  /** A block arrived from a peer. */
  async receiveBlock(block, from) {
    const result = this.chain.addBlock(block, { source: from || 'peer' });
    if (result.ok) {
      this.log(`accepted block #${block.index} ${block.hash.slice(0, 12)}… from ${from || 'peer'}`);
      this.broadcastBlock(block, from);
      this.replicateFiles(block);
      return result;
    }
    if ((result.code === 'AHEAD' || result.code === 'FORK') && from) {
      // They may be on a heavier branch than us; fetch and compare.
      await this.syncFrom(from);
    }
    return result;
  }

  async syncFrom(peer) {
    try {
      const { ok, data } = await this.request(peer, '/p2p/chain');
      if (!ok || !Array.isArray(data.blocks)) return false;
      const result = this.chain.replaceChain(data.blocks, { source: peer });
      if (result.replaced) {
        for (const b of this.chain.blocks.slice(result.forkPoint)) this.replicateFiles(b);
      }
      return result.replaced;
    } catch {
      return false;
    }
  }

  /** Ask every peer for its tip; adopt any heavier chain. */
  async syncAll() {
    const ours = this.chain.work;
    await Promise.all(
      this.list().map(async (peer) => {
        try {
          const { ok, data } = await this.request(peer, '/p2p/tip');
          if (!ok) throw new Error('bad status');
          this.peerInfo.set(peer, { online: true, ...data, seenAt: Date.now() });
          for (const p of data.peers || []) this.addPeer(p);
          const heavier = data.work > ours || (data.work === ours && data.tipHash < this.chain.tip.hash);
          if (heavier && data.tipHash !== this.chain.tip.hash) await this.syncFrom(peer);
        } catch {
          const prev = this.peerInfo.get(peer) || {};
          this.peerInfo.set(peer, { ...prev, online: false });
        }
      })
    );
    // Anti-entropy: pick up any image we still lack (e.g. a peer was offline).
    for (const block of this.chain.blocks) this.replicateFiles(block);
  }

  /** Pull any image referenced on chain that we don't hold yet. */
  replicateFiles(block) {
    this.fetching = this.fetching || new Set();
    for (const tx of block.transactions) {
      const hash = tx.type === 'REGISTER' && tx.payload.fileHash;
      if (!hash || this.fetching.has(hash) || this.files.has(hash)) continue;
      this.fetching.add(hash);
      this.files
        .fetchFromPeers(hash, this.list())
        .catch(() => {})
        .finally(() => this.fetching.delete(hash));
    }
  }

  async start() {
    for (const peer of this.list()) {
      this.request(peer, '/p2p/hello', { url: this.selfUrl }).catch(() => {});
    }
    await this.syncAll();
    for (const block of this.chain.blocks) this.replicateFiles(block);
    this.timer = setInterval(() => this.syncAll().catch(() => {}), SYNC_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  status() {
    return this.list().map((url) => {
      const info = this.peerInfo.get(url) || {};
      return {
        url,
        online: Boolean(info.online),
        name: info.name || null,
        height: info.height ?? null,
        tipHash: info.tipHash || null,
        inSync: info.tipHash === this.chain.tip.hash,
        seenAt: info.seenAt || null,
      };
    });
  }
}

module.exports = { P2P };
