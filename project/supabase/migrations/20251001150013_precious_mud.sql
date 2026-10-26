-- Fix foreign key relationship between artwork_metadata and profiles
-- Step 1: Drop all policies that depend on user_id column
DROP POLICY IF EXISTS "Users can insert own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can update own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can delete own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can read own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Authenticated users can read all artworks" ON artwork_metadata;

-- Step 2: Alter column type from text to uuid
ALTER TABLE artwork_metadata 
ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Step 3: Add foreign key constraint
ALTER TABLE artwork_metadata 
ADD CONSTRAINT artwork_metadata_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Step 4: Recreate policies with uuid comparison
CREATE POLICY "Authenticated users can read all artworks"
  ON artwork_metadata
  FOR SELECT
  TO authenticated
  USING (true);

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