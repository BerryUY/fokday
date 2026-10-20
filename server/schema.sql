-- Momentum backup storage (the API also creates it automatically on first use).
-- Run in Neon → SQL Editor if you prefer to create it by hand.
CREATE TABLE IF NOT EXISTS momentum_backups (
  id uuid PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS momentum_backups_received_idx ON momentum_backups (received_at DESC);
