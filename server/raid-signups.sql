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

CREATE TABLE IF NOT EXISTS discord_raid_chart_queue (
  event_id TEXT PRIMARY KEY REFERENCES discord_raid_signups(event_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL DEFAULT 1,
  synced_generation INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  patched_at INTEGER
);
CREATE INDEX IF NOT EXISTS discord_raid_chart_due
  ON discord_raid_chart_queue(retry_at) WHERE generation > synced_generation;

CREATE TABLE IF NOT EXISTS discord_raid_chart_names (
  message_id TEXT NOT NULL REFERENCES discord_raid_signups(message_id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  PRIMARY KEY(message_id, character_id)
);

-- An explicitly withdrawn name must stay hidden when Discord retries an
-- older interaction. There is one watermark per character per signup message.
CREATE TABLE IF NOT EXISTS discord_raid_chart_withdrawals (
  message_id TEXT NOT NULL REFERENCES discord_raid_signups(message_id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  withdrawn_at INTEGER NOT NULL,
  PRIMARY KEY(message_id, character_id)
);

-- Existing published messages have no chart yet. The worker checks the current
-- channel and raid end time before editing. Completed rows make reruns safe.
INSERT OR IGNORE INTO discord_raid_chart_queue(event_id)
  SELECT event_id FROM discord_raid_signups WHERE message_id IS NOT NULL;

