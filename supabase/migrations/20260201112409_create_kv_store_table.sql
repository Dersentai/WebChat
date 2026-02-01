/*
  # Create key-value store for chat application

  1. New Tables
    - `kv_store_98c5d13a`
      - `key` (text, primary key) - unique identifier for stored data
      - `value` (jsonb) - JSON data stored for the key
  
  2. Security
    - Enable RLS on `kv_store_98c5d13a` table
    - Add policy for service role access only (chat backend will use service role key)

  3. Notes
    - This table is used by the chat application to store messages, settings, and statistics
    - Only accessible via the edge function using service role key
*/

CREATE TABLE IF NOT EXISTS kv_store_98c5d13a (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);

ALTER TABLE kv_store_98c5d13a ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (no public access)
-- Edge functions use service role key to manage chat data
CREATE POLICY "Service role full access"
  ON kv_store_98c5d13a
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);