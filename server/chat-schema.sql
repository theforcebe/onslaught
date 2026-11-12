CREATE TABLE IF NOT EXISTS chat_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_key TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_label TEXT NOT NULL,
  recipient_id TEXT,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  sent_at INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  UNIQUE(sender_id, client_id)
);
CREATE INDEX IF NOT EXISTS chat_thread_sequence ON chat_messages(thread_key, seq);
CREATE INDEX IF NOT EXISTS chat_recipient_sequence ON chat_messages(recipient_id, seq);
CREATE TABLE IF NOT EXISTS chat_reads (
  member_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(member_id, thread_key)
);
CREATE TABLE IF NOT EXISTS chat_membership (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
