ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_channel_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_channel_check
  CHECK (channel IN ('email', 'sms', 'websocket'));

CREATE TABLE IF NOT EXISTS web_socket_connections (
  connection_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS web_socket_connections_user_idx
  ON web_socket_connections (user_id);
