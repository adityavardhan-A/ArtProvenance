/**
 * ArtChain protocol constants.
 *
 * These are consensus rules: every node must agree on them, or nodes will
 * reject each other's blocks. Changing one is a "hard fork".
 */
module.exports = {
  /** Name shown in the explorer and stamped into the genesis block. */
  CHAIN_NAME: 'ArtChain',

  /** Fixed so that every node builds the identical genesis block. */
  GENESIS_TIMESTAMP: 1760000000000,
  GENESIS_MESSAGE: 'ArtChain genesis: provenance for digital art, recorded by its makers',

  /**
   * Proof-of-work: a block hash must start with this many hex zeros.
   * Each extra zero makes mining ~16x harder. 4 takes well under a second on
   * a laptop; nodes may choose any value between MIN and MAX.
   */
  DEFAULT_DIFFICULTY: 4,
  MIN_DIFFICULTY: 3,
  MAX_DIFFICULTY: 7,

  /** Upper bound on transactions per block. */
  MAX_TX_PER_BLOCK: 50,

  /** Largest serialised transaction accepted, in bytes. */
  MAX_TX_BYTES: 4096,

  /** Blocks may not claim a time this far in the future (ms). */
  MAX_FUTURE_DRIFT_MS: 2 * 60 * 1000,

  /** Transactions older than this are refused into the mempool (ms). */
  MAX_TX_AGE_MS: 30 * 60 * 1000,

  /**
   * On-chain copy rule: a REGISTER whose perceptual hash is within this many
   * bits of a work owned by someone else is rejected by every node.
   */
  NEAR_DUPLICATE_BITS: 10,

  /** Largest image the content store accepts. */
  MAX_FILE_BYTES: 25 * 1024 * 1024,

  TX_TYPES: ['IDENTITY', 'REGISTER', 'TRANSFER', 'REPORT'],
};
