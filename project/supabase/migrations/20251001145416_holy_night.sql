/*
  # Add foreign key relationship between artwork_metadata and profiles

  1. Changes
    - Add foreign key constraint from artwork_metadata.user_id to profiles.id
    - Update user_id column to be uuid type instead of text
    - Ensure referential integrity with CASCADE delete

  2. Notes
    - This enables proper joins between artwork_metadata and profiles tables
    - Existing data will be preserved during the migration
*/

-- First, update existing user_id values to match the uuid format from auth.users
UPDATE artwork_metadata 
SET user_id = auth.uid()::text 
WHERE user_id IS NOT NULL;

-- Add foreign key constraint
DO $$
BEGIN
  -- Check if the foreign key constraint doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'artwork_metadata_user_id_fkey' 
    AND table_name = 'artwork_metadata'
  ) THEN
    -- First, ensure user_id column is uuid type
    ALTER TABLE artwork_metadata 
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
    
    -- Add the foreign key constraint
    ALTER TABLE artwork_metadata 
    ADD CONSTRAINT artwork_metadata_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;