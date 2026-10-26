/**
 * Starts three real node processes and checks that a transaction sent to one
 * is mined and that every node converges on the same chain and file.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { wallet, tx } = require('./helpers');
const { sha256 } = require('../chain/crypto');

const PORTS = [4191, 4192, 4193];
const urls = PORTS.map((p) => `http://localhost:${p}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* not ready */
    }
    if (Date.now() - start > timeout) throw new Error('timed out');
    await sleep(250);
  }
}

test('three nodes gossip, mine and converge', { timeout: 60000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artchain-net-'));
  const nodes = PORTS.map((port, i) =>
    fork(
      path.join(__dirname, '..', 'server.js'),
      ['--port', String(port), '--name', `t${i + 1}`, '--difficulty', '3', '--data', path.join(root, `n${i}`), '--peers', urls.filter((_, j) => j !== i).join(',')],
      { stdio: 'ignore' }
    )
  );
  t.after(() => nodes.forEach((n) => n.kill()));

  await waitFor(async () => (await Promise.all(urls.map((u) => fetch(u + '/status')))).every((r) => r.ok));

  // Store an "image" on node 1 only.
  const png = Buffer.from('89504e470d0a1a0a' + 'ab'.repeat(64), 'hex');
  const put = await (await fetch(urls[0] + '/files', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })).json();
  assert.equal(put.hash, sha256(png));

  const alice = wallet();
  const reg = tx(alice, 'REGISTER', { fileHash: put.hash, perceptualHash: '1234567890abcdef', title: 'Network test', mimeType: 'image/png', size: png.length });
  const res = await fetch(urls[0] + '/tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reg) });
  assert.equal(res.status, 202);

  // Every node ends up with the transaction confirmed at the same tip.
  const tips = await waitFor(async () => {
    const s = await Promise.all(urls.map(async (u) => (await fetch(u + '/status')).json()));
    const same = s.every((x) => x.height >= 1 && x.tipHash === s[0].tipHash);
    return same ? s : null;
  });
  assert.ok(tips.every((s) => s.artworks === 1));

  // Node 3 never received the upload but can serve it, verified by hash.
  const file = await waitFor(async () => {
    const r = await fetch(`${urls[2]}/files/${put.hash}`);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  });
  assert.equal(sha256(file), put.hash);

  const v = await (await fetch(urls[1] + '/chain/validate')).json();
  assert.ok(v.valid);
});
