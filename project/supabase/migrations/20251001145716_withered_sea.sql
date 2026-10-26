/*
  # Fix foreign key relationship between artwork_metadata and profiles

  1. Changes
    - Update user_id column in artwork_metadata to uuid type
    - Add foreign key constraint to profiles table
    - Ensure referential integrity

  2. Notes
    - This fixes the join query error in the gallery
    - Existing data will be preserved during migration
*/

-- First, update the user_id column to uuid type
ALTER TABLE artwork_metadata 
ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Add foreign key constraint
ALTER TABLE artwork_metadata 
ADD CONSTRAINT artwork_metadata_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Update RLS policies to use uuid comparison
DROP POLICY IF EXISTS "Users can insert own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can update own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can delete own artworks" ON artwork_metadata;

CREATE POLICY "Users can insert own artworks"
  ON artwork_metadata
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own artworks"
  ON artwork_metadata
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own artworks"
  ON artwork_metadata
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());