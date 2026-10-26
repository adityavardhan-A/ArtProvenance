/*
  # Fix data consistency and add foreign key relationship

  1. Data Cleanup
    - Ensure all users in artwork_metadata have corresponding profiles
    - Create missing profiles for orphaned artwork records
    - Update user_id column to uuid type

  2. Foreign Key Setup
    - Add foreign key constraint between artwork_metadata and profiles
    - Update RLS policies to work with uuid types

  3. Security
    - Recreate all necessary RLS policies
    - Maintain data integrity
*/

-- Step 1: Drop all policies that depend on user_id column
DROP POLICY IF EXISTS "Users can insert own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can update own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can delete own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Users can read own artworks" ON artwork_metadata;
DROP POLICY IF EXISTS "Authenticated users can read all artworks" ON artwork_metadata;

-- Step 2: Create missing profiles for orphaned artwork records
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
SELECT DISTINCT 
  artwork_metadata.user_id::uuid,
  COALESCE(auth.users.email, 'unknown@example.com'),
  COALESCE(auth.users.raw_user_meta_data->>'full_name', 'Unknown User'),
  COALESCE(auth.users.created_at, now()),
  now()
FROM artwork_metadata
LEFT JOIN auth.users ON auth.users.id = artwork_metadata.user_id::uuid
LEFT JOIN profiles ON profiles.id = artwork_metadata.user_id::uuid
WHERE profiles.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Step 3: Alter column type from text to uuid
ALTER TABLE artwork_metadata 
ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

-- Step 4: Add foreign key constraint
ALTER TABLE artwork_metadata 
ADD CONSTRAINT artwork_metadata_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Step 5: Recreate policies with uuid comparison
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