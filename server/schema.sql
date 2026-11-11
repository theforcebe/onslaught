CREATE TABLE IF NOT EXISTS auth_records (key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_expiration ON auth_records(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(key,bucket));
