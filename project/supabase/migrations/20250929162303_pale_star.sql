/*
  # Add hash column to artwork_metadata table

  1. Schema Changes
    - Add `hash` column to `artwork_metadata` table
    - Hash will store SHA256 hash of the uploaded image
    - Make hash unique to prevent duplicate uploads

  2. Index
    - Add index on hash column for faster verification queries
*/

-- Add hash column to artwork_metadata table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artwork_metadata' AND column_name = 'hash'
  ) THEN
    ALTER TABLE artwork_metadata ADD COLUMN hash text UNIQUE;
  END IF;
END $$;

-- Create index on hash column for faster lookups
CREATE INDEX IF NOT EXISTS idx_artwork_metadata_hash ON artwork_metadata(hash);

-- Add comment for documentation
COMMENT ON COLUMN artwork_metadata.hash IS 'SHA256 hash of the uploaded image file for blockchain verification';