CREATE TABLE IF NOT EXISTS item_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS item_cache_expiry ON item_cache(expires_at);
