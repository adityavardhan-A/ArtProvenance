/**
 * ArtChain wallet: an ECDSA P-256 key pair generated and kept in this browser.
 *
 * The private key signs every transaction the artist makes. It never leaves
 * the device except in a passphrase-encrypted backup the artist downloads
 * themselves (PBKDF2 → AES-256-GCM). Nodes only ever see the public key and
 * signatures.
 */
import { addressOf, canonical, sha256Hex, toHex, fromHex, type ChainTx, type TxType } from './artchain';

export interface Wallet {
  version: 1;
  address: string;
  publicKey: string; // uncompressed point, hex
  privateJwk: JsonWebKey;
  createdAt: number;
}

const storageKey = (userId: string) => `artchain:wallet:${userId}`;

export function loadWallet(userId: string): Wallet | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Wallet) : null;
  } catch {
    return null;
  }
}

function saveWallet(userId: string, wallet: Wallet) {
  localStorage.setItem(storageKey(userId), JSON.stringify(wallet));
}

export async function createWallet(userId: string): Promise<Wallet> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const wallet: Wallet = { version: 1, address: await addressOf(publicKey), publicKey, privateJwk, createdAt: Date.now() };
  saveWallet(userId, wallet);
  return wallet;
}

async function signId(wallet: Wallet, id: string): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', wallet.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(id));
  return toHex(sig);
}

/** Build, hash and sign a transaction. */
export async function signTransaction(wallet: Wallet, type: TxType, payload: Record<string, any>): Promise<ChainTx> {
  const body = { type, from: wallet.address, publicKey: wallet.publicKey, payload, timestamp: Date.now() };
  const id = await sha256Hex(canonical(body));
  return { ...body, id, signature: await signId(wallet, id) };
}

// ------------------------------------------------------------------ backups

interface Keystore {
  artchainKeystore: 1;
  address: string;
  publicKey: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string; ciphertext: string };
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportKeystore(wallet: Wallet, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 210_000;
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(wallet.privateJwk));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const keystore: Keystore = {
    artchainKeystore: 1,
    address: wallet.address,
    publicKey: wallet.publicKey,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toHex(salt) },
    cipher: { name: 'AES-GCM', iv: toHex(iv), ciphertext: toHex(ciphertext) },
  };
  return JSON.stringify(keystore, null, 2);
}

export async function importKeystore(userId: string, json: string, passphrase: string): Promise<Wallet> {
  let ks: Keystore;
  try {
    ks = JSON.parse(json);
  } catch {
    throw new Error('That file is not an ArtChain wallet backup.');
  }
  if (ks.artchainKeystore !== 1) throw new Error('That file is not an ArtChain wallet backup.');

  let privateJwk: JsonWebKey;
  try {
    const key = await deriveKey(passphrase, fromHex(ks.kdf.salt), ks.kdf.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(ks.cipher.iv) as BufferSource }, key, fromHex(ks.cipher.ciphertext) as BufferSource);
    privateJwk = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('Wrong passphrase, or the backup file is damaged.');
  }

  if ((await addressOf(ks.publicKey)) !== ks.address) throw new Error('Backup is inconsistent: address does not match its key.');

  const wallet: Wallet = { version: 1, address: ks.address, publicKey: ks.publicKey, privateJwk, createdAt: Date.now() };
  // Prove the key pair matches before trusting it.
  const probe = await signTransaction(wallet, 'IDENTITY', { name: 'probe' });
  const pub = await crypto.subtle.importKey('raw', fromHex(ks.publicKey) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromHex(probe.signature) as BufferSource, new TextEncoder().encode(probe.id));
  if (!ok) throw new Error('Backup is inconsistent: private key does not match the public key.');

  saveWallet(userId, wallet);
  return wallet;
}
