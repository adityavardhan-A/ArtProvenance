/**
 * Start a three-node ArtChain network in one terminal.
 *
 *   npm start            (or: node network.js)
 *   node network.js 5    (five nodes)
 *
 * Each node is a separate process with its own data folder, mining and
 * validating independently; they talk only over HTTP like real peers.
 */
const { fork } = require('node:child_process');
const path = require('node:path');

const COUNT = Math.max(1, Math.min(9, Number(process.argv[2]) || 3));
const BASE_PORT = 4001;
const COLOURS = [36, 35, 33, 32, 34, 31, 96, 95, 93];

const urls = Array.from({ length: COUNT }, (_, i) => `http://localhost:${BASE_PORT + i}`);
const children = [];

urls.forEach((url, i) => {
  const name = `node-${i + 1}`;
  const peers = urls.filter((u) => u !== url).join(',');
  const child = fork(
    path.join(__dirname, 'server.js'),
    ['--port', String(BASE_PORT + i), '--name', name, ...(peers ? ['--peers', peers] : [])],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
  );
  const colour = COLOURS[i % COLOURS.length];
  const prefix = (line) => `\x1b[${colour}m${line}\x1b[0m`;
  const pipe = (stream) =>
    stream.on('data', (d) =>
      String(d)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((l) => console.log(prefix(l)))
    );
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => console.log(prefix(`[${name}] exited (${code})`)));
  children.push(child);
});

console.log(`\nArtChain: starting ${COUNT} nodes on ports ${BASE_PORT}–${BASE_PORT + COUNT - 1}. Press Ctrl+C to stop.\n`);

const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
