
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('donor', 'patient', 'hospital', 'admin'));

ALTER TABLE donor_profiles DROP CONSTRAINT IF EXISTS donor_profiles_latitude_longitude_check;
ALTER TABLE donor_profiles
  ADD CONSTRAINT donor_profiles_latitude_longitude_check CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS request_responses_request_status_idx
  ON request_responses (blood_request_id, status);
CREATE INDEX IF NOT EXISTS donor_profiles_available_radius_idx
  ON donor_profiles (is_available, notification_radius_km)
  WHERE is_available = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('new_request', 'response_accepted', 'donation_completed')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON notification_outbox (available_at, created_at)
  WHERE status = 'pending';

