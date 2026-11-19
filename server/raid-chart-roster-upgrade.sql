-- Refresh existing Discord posts once when website signups become visible by
-- default. Workers independently verify the raid is still open and the channel
-- is still the configured destination before editing its original message.
UPDATE discord_raid_chart_queue
   SET generation = generation + 1, failures = 0, retry_at = 0
 WHERE event_id IN (SELECT event_id FROM discord_raid_signups WHERE message_id IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM discord_config WHERE key = 'raid-chart-roster-v2');
INSERT OR IGNORE INTO discord_config(key, payload) VALUES ('raid-chart-roster-v2', 'true');
