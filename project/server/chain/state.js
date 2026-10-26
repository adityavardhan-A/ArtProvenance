/**
 * World state and the registry rules — ArtChain's built-in "smart contract".
 *
 * State is never stored as a source of truth: it is rebuilt by replaying every
 * block from genesis, so any node can recompute it and check another's. Each
 * rule below runs on every node for every transaction; a block containing a
 * transaction that breaks one is rejected by the whole network.
 */
const config = require('./config');
const { hammingDistance } = require('./crypto');

class RuleError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

class RegistryState {
  constructor() {
    /** fileHash -> artwork record */
    this.artworks = new Map();
    /** address -> { name, since, updatedAt, txId } */
    this.identities = new Map();
    /** every transaction id ever confirmed (replay protection) */
    this.txIds = new Set();
  }

  clone() {
    const copy = new RegistryState();
    for (const [k, v] of this.artworks) {
      copy.artworks.set(k, {
        ...v,
        history: v.history.map((h) => ({ ...h })),
        reports: v.reports.map((r) => ({ ...r })),
      });
    }
    for (const [k, v] of this.identities) copy.identities.set(k, { ...v });
    copy.txIds = new Set(this.txIds);
    return copy;
  }

  /** Closest registered works to a perceptual hash, nearest first. */
  similar(perceptualHash, maxBits = 20, excludeHash = null) {
    if (!perceptualHash) return [];
    const out = [];
    for (const art of this.artworks.values()) {
      if (!art.perceptualHash || art.fileHash === excludeHash) continue;
      const distance = hammingDistance(perceptualHash, art.perceptualHash);
      if (distance <= maxBits) out.push({ artwork: art, distance });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Check a transaction against the rules and, if it passes, apply it.
   * `ctx` is the block it is being included in: { index, hash, timestamp }.
   * Throws RuleError (and leaves state untouched) if a rule is broken.
   */
  apply(tx, ctx) {
    if (this.txIds.has(tx.id)) {
      throw new RuleError('DUPLICATE_TX', 'This transaction is already on the chain.');
    }

    const p = tx.payload;
    const event = { type: tx.type, txId: tx.id, block: ctx.index, timestamp: ctx.timestamp };

    switch (tx.type) {
      case 'IDENTITY': {
        const prior = this.identities.get(tx.from);
        this.identities.set(tx.from, {
          name: p.name.trim(),
          since: prior ? prior.since : ctx.timestamp,
          updatedAt: ctx.timestamp,
          txId: tx.id,
        });
        break;
      }

      case 'REGISTER': {
        const existing = this.artworks.get(p.fileHash);
        if (existing) {
          throw new RuleError('ALREADY_REGISTERED', 'This exact file is already registered.', {
            fileHash: p.fileHash,
            owner: existing.owner,
          });
        }
        if (p.perceptualHash) {
          const near = this.similar(p.perceptualHash, config.NEAR_DUPLICATE_BITS).find(
            (m) => m.artwork.creator !== tx.from
          );
          if (near) {
            throw new RuleError(
              'SUSPECTED_COPY',
              `Rejected: this image is visually near-identical to "${near.artwork.title}" (${near.distance} of 64 bits differ), registered by another artist.`,
              { originalHash: near.artwork.fileHash, distance: near.distance }
            );
          }
        }
        this.artworks.set(p.fileHash, {
          fileHash: p.fileHash,
          perceptualHash: p.perceptualHash || '',
          title: p.title.trim(),
          description: (p.description || '').trim(),
          mimeType: p.mimeType || 'image/*',
          size: p.size || null,
          creator: tx.from,
          owner: tx.from,
          registeredAt: ctx.timestamp,
          block: ctx.index,
          blockHash: ctx.hash,
          txId: tx.id,
          history: [{ ...event, from: null, to: tx.from }],
          reports: [],
        });
        break;
      }

      case 'TRANSFER': {
        const art = this.artworks.get(p.fileHash);
        if (!art) throw new RuleError('NOT_REGISTERED', 'That artwork is not registered.');
        if (art.owner !== tx.from) {
          throw new RuleError('NOT_OWNER', 'Only the current owner can transfer this artwork.', { owner: art.owner });
        }
        if (p.to === tx.from) throw new RuleError('SELF_TRANSFER', 'You already own this artwork.');
        art.owner = p.to;
        art.history.push({ ...event, from: tx.from, to: p.to, note: p.note || '' });
        break;
      }

      case 'REPORT': {
        const art = this.artworks.get(p.originalHash);
        if (!art) throw new RuleError('NOT_REGISTERED', 'The original artwork is not registered.');
        if (p.suspectHash === p.originalHash) {
          throw new RuleError('SELF_REPORT', 'A file cannot be reported as a copy of itself.');
        }
        if (art.reports.some((r) => r.suspectHash === p.suspectHash && r.reporter === tx.from)) {
          throw new RuleError('DUPLICATE_REPORT', 'You have already reported this copy.');
        }
        art.reports.push({
          ...event,
          reporter: tx.from,
          suspectHash: p.suspectHash,
          distance: p.distance,
          note: p.note || '',
        });
        break;
      }

      default:
        throw new RuleError('UNKNOWN_TYPE', `Unknown transaction type ${tx.type}`);
    }

    this.txIds.add(tx.id);
  }

  /** Apply without mutating on failure: try on a clone first. */
  tryApply(tx, ctx) {
    const trial = this.clone();
    trial.apply(tx, ctx);
    return trial;
  }
}

module.exports = { RegistryState, RuleError };
