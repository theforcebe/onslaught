CREATE TABLE IF NOT EXISTS discord_config (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS discord_links (member_id TEXT PRIMARY KEY, discord_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, dm_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(dm_opt_in IN (0,1)));
CREATE TABLE IF NOT EXISTS discord_deliveries (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
