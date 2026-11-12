-- Separate consent for forwarding private chat; material-request DM consent is unchanged.
CREATE TABLE IF NOT EXISTS chat_discord_preferences (
  member_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_discord_deliveries (
  message_seq INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('sending','sent','failed','uncertain','disabled'))
);
