/*
  # Create artwork metadata table

  1. New Tables
    - `artwork_metadata`
      - `id` (uuid, primary key)
      - `user_id` (text, references auth.users.id)
      - `title` (text, required)
      - `description` (text)
      - `image_url` (text, public URL from storage)
      - `uploaded_at` (timestamp, default now)

  2. Security
    - Enable RLS on `artwork_metadata` table
    - Add policy for authenticated users to read/write their own artworks
*/

CREATE TABLE IF NOT EXISTS artwork_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE artwork_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own artworks"
  ON artwork_metadata
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own artworks"
  ON artwork_metadata
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own artworks"
  ON artwork_metadata
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own artworks"
  ON artwork_metadata
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::text);