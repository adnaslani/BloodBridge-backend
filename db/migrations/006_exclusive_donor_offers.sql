CREATE TABLE IF NOT EXISTS donor_offers (
  id UUID PRIMARY KEY,
  blood_request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  distance_km NUMERIC(7, 2) NOT NULL CHECK (distance_km >= 0),
  UNIQUE (blood_request_id, donor_user_id),
  CHECK (expires_at > offered_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS donor_offers_one_pending_per_request_idx
  ON donor_offers (blood_request_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS donor_offers_donor_pending_idx
  ON donor_offers (donor_user_id, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS donor_offers_expiry_idx
  ON donor_offers (expires_at)
  WHERE status = 'pending';

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_event_type_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_event_type_check
  CHECK (event_type IN ('new_request', 'donor_offer_created', 'response_accepted', 'donation_completed'));
