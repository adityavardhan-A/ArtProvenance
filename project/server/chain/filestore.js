/**
 * Content-addressed file store (a small IPFS-style layer).
 *
 * Images are stored under their SHA-256, the same hash that REGISTER puts on
 * chain, so the address of a file *is* its integrity check: a node that
 * receives bytes whose hash doesn't match refuses them. Nodes fetch missing
 * files from peers, so every node ends up holding every registered image.
 */
const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('./crypto');
const config = require('./config');

const HEX64 = /^[0-9a-f]{64}$/;

class FileStore {
  constructor(dir, { log = () => {} } = {}) {
    this.dir = dir;
    this.log = log;
    fs.mkdirSync(dir, { recursive: true });
  }

  pathFor(hash) {
    return path.join(this.dir, hash);
  }

  has(hash) {
    return HEX64.test(hash) && fs.existsSync(this.pathFor(hash));
  }

  meta(hash) {
    try {
      return JSON.parse(fs.readFileSync(this.pathFor(hash) + '.json', 'utf8'));
    } catch {
      return { mimeType: 'application/octet-stream' };
    }
  }

  /** Store bytes; returns their hash. Rejects anything that isn't an image. */
  put(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Empty file.');
    if (buffer.length > config.MAX_FILE_BYTES) throw new Error('File is larger than 25 MB.');
    if (!/^image\//.test(mimeType || '')) throw new Error('Only image files can be stored.');

    const hash = sha256(buffer);
    if (!this.has(hash)) {
      fs.writeFileSync(this.pathFor(hash), buffer);
      fs.writeFileSync(this.pathFor(hash) + '.json', JSON.stringify({ mimeType, size: buffer.length, storedAt: Date.now() }));
    }
    return { hash, size: buffer.length, mimeType };
  }

  get(hash) {
    if (!this.has(hash)) return null;
    return { buffer: fs.readFileSync(this.pathFor(hash)), ...this.meta(hash) };
  }

  count() {
    return fs.readdirSync(this.dir).filter((f) => HEX64.test(f)).length;
  }

  /** Fetch from the first peer that has it, verifying the hash. */
  async fetchFromPeers(hash, peers) {
    for (const peer of peers) {
      try {
        const res = await fetch(`${peer}/files/${hash}`, {
          headers: { 'x-artchain-peer-fetch': '1' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (sha256(buffer) !== hash) {
          this.log(`⚠ peer ${peer} served bytes that don't match ${hash.slice(0, 12)}…; discarded`);
          continue;
        }
        this.put(buffer, res.headers.get('content-type') || 'image/*');
        this.log(`replicated file ${hash.slice(0, 12)}… from ${peer}`);
        return true;
      } catch {
        /* try next peer */
      }
    }
    return false;
  }
}

module.exports = { FileStore };
