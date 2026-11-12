ALTER TABLE chat_messages ADD COLUMN mentions_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS chat_mentions (
  message_seq INTEGER NOT NULL REFERENCES chat_messages(seq) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  read_at INTEGER,
  PRIMARY KEY(message_seq, member_id)
);
CREATE INDEX IF NOT EXISTS chat_member_mentions ON chat_mentions(member_id, read_at, message_seq);
