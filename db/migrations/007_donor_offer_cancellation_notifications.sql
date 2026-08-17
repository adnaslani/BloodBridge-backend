ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_event_type_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_event_type_check
  CHECK (event_type IN (
    'new_request',
    'donor_offer_created',
    'donor_offer_cancelled',
    'response_accepted',
    'donation_completed'
  ));
