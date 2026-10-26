/*
  # Add perceptual hash column to artwork_metadata

  1. Schema Changes
    - Add `perceptual_hash` column to `artwork_metadata` table
    - Perceptual hash will be used for similarity detection of altered images
    - Create index for faster lookups

  2. Notes
    - Perceptual hash detects similar/altered images unlike cryptographic hash
    - Used for forgery detection with Hamming distance comparison
*/

-- Add perceptual_hash column to artwork_metadata table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'perceptual_hash'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN perceptual_hash text;
  END IF;
END $$;

-- Create index on perceptual_hash column for faster lookups
CREATE INDEX IF NOT EXISTS idx_artwork_metadata_perceptual_hash ON artwork_metadata(perceptual_hash);

-- Add comment for documentation
COMMENT ON COLUMN artwork_metadata.perceptual_hash IS 'Perceptual hash for similarity detection and forgery prevention';
