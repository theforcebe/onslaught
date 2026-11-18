CREATE TABLE IF NOT EXISTS discord_raid_signups (
  event_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT UNIQUE,
  scheduled_id TEXT,
  interactive INTEGER NOT NULL DEFAULT 0,
  notice TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  message_attempt INTEGER NOT NULL DEFAULT 0
);

