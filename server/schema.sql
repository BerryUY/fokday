-- Momentum backup storage (the API also creates it automatically on first use).
-- Run in Neon → SQL Editor if you prefer to create it by hand.
CREATE TABLE IF NOT EXISTS momentum_profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,   -- sha256 of the person's secret token; the token itself is never stored
  plan text NOT NULL DEFAULT 'free', -- reserved for a future paid plan
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS momentum_backups (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES momentum_profiles (id) ON DELETE CASCADE,
  device_id text NOT NULL,
  schema_version integer NOT NULL,
  local_revision bigint NOT NULL,
  checksum text NOT NULL,
  size_bytes integer NOT NULL,
  counts jsonb NOT NULL,
  payload text NOT NULL,
  created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS momentum_backups_profile_idx ON momentum_backups (profile_id, received_at DESC);
