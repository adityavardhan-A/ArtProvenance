/*
  # Store on-chain proof alongside artwork metadata

  1. Schema Changes
    - `tx_hash`        transaction hash of the registration
    - `block_number`   block the registration landed in
    - `owner_address`  address credited as provenance owner on chain
    - `chain_status`   'confirmed' | 'pending' | 'failed' | 'skipped'
    - `chain_error`    last failure reason, for retry surfaces
    - `registered_at`  when the chain write confirmed

  2. Rationale
    Previously the UI showed a "Blockchain Verified" badge with nothing behind
    it. Persisting the tx hash makes the claim auditable: anyone can open the
    transaction on Etherscan and confirm the hash was committed.

    `chain_status` lets an upload succeed even when the chain write fails, so
    the artwork isn't lost — it is flagged 'pending' and can be retried.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'tx_hash'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN tx_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'block_number'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN block_number bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'owner_address'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN owner_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'chain_status'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN chain_status text DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'chain_error'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN chain_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'registered_at'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN registered_at timestamptz;
  END IF;
END $$;

-- Constrain chain_status to the known set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'artwork_metadata_chain_status_check'
      AND table_name = 'artwork_metadata'
  ) THEN
    ALTER TABLE artwork_metadata
      ADD CONSTRAINT artwork_metadata_chain_status_check
      CHECK (chain_status IN ('confirmed', 'pending', 'failed', 'skipped'));
  END IF;
END $$;

-- Look-ups by transaction, and scans for work still awaiting confirmation.
CREATE INDEX IF NOT EXISTS idx_artwork_metadata_tx_hash
  ON artwork_metadata(tx_hash);

CREATE INDEX IF NOT EXISTS idx_artwork_metadata_chain_status
  ON artwork_metadata(chain_status)
  WHERE chain_status <> 'confirmed';

COMMENT ON COLUMN artwork_metadata.tx_hash IS 'Sepolia transaction hash of the ImageRegistry registration';
COMMENT ON COLUMN artwork_metadata.block_number IS 'Block height the registration was mined in';
COMMENT ON COLUMN artwork_metadata.owner_address IS 'Address credited as provenance owner on chain';
COMMENT ON COLUMN artwork_metadata.chain_status IS 'confirmed | pending | failed | skipped';
COMMENT ON COLUMN artwork_metadata.chain_error IS 'Last on-chain failure reason, retained for retries';
