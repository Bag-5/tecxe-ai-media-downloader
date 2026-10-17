-- TECXE AI-Media Downloader — Neon Postgres schema
--
-- Timestamps are BIGINT epoch milliseconds. Postgres timestamptz would work too,
-- but epoch-ms matches the client-side `Date.now()` used throughout the app,
-- avoiding a timezone-conversion class of bugs on a single-user tool.
--
-- Neon's serverless driver rejects multi-statement prepared queries, so this
-- file is applied one statement at a time (see db/migrate.mjs).

CREATE TABLE IF NOT EXISTS searches (
  id           TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  intent       JSONB,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'queued',
  url        TEXT NOT NULL,
  platform   TEXT,
  title      TEXT,
  kind       TEXT,
  progress   INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  filepath   TEXT,
  metadata   JSONB,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS media_items (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  artist      TEXT,
  platform    TEXT NOT NULL,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'unknown',
  duration    INTEGER,
  filepath    TEXT NOT NULL,
  size_bytes  BIGINT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  ai_metadata JSONB,
  created_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Stores candidates so a search can be revisited after the response is gone.
CREATE TABLE IF NOT EXISTS candidates (
  id         TEXT PRIMARY KEY,
  search_id  TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  video_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  channel    TEXT,
  duration   INTEGER,
  view_count BIGINT,
  url        TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  reason     TEXT,
  filename   TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS jobs_status_idx        ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_created_idx        ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS media_items_platform_idx ON media_items (platform);
CREATE INDEX IF NOT EXISTS media_items_created_idx ON media_items (created_at DESC);
CREATE INDEX IF NOT EXISTS media_items_tags_idx    ON media_items USING GIN (tags);
CREATE INDEX IF NOT EXISTS candidates_search_idx   ON candidates (search_id, position);