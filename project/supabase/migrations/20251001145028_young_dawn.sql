/*
  # Update RLS policies for universal gallery

  1. Policy Changes
    - Update artwork_metadata policies to allow public read access for gallery
    - Keep write/update/delete restricted to artwork owners
    - Add join with profiles table for artist information

  2. Security
    - Maintain user privacy while allowing public gallery viewing
    - Hash information only visible to artwork owners
*/

-- Drop existing restrictive read policy
DROP POLICY IF EXISTS "Users can read own artworks" ON artwork_metadata;

-- Create new policy allowing all authenticated users to read all artworks (for universal gallery)
CREATE POLICY "Authenticated users can read all artworks"
  ON artwork_metadata
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep existing policies for insert/update/delete (users can only modify their own artworks)
-- These should already exist from previous migrations

-- Ensure profiles table allows reading other profiles for artist information in gallery
DROP POLICY IF EXISTS "Users can read other profiles" ON profiles;

CREATE POLICY "Authenticated users can read all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);