-- Align databases created with the earlier owner_id column with the current API.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blood_requests' AND column_name = 'owner_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'blood_requests' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE blood_requests RENAME COLUMN owner_id TO created_by_user_id;
  END IF;
END $$;

ALTER TABLE blood_requests
  ALTER COLUMN latitude SET NOT NULL,
  ALTER COLUMN longitude SET NOT NULL;

CREATE INDEX IF NOT EXISTS blood_requests_creator_idx
  ON blood_requests (created_by_user_id);
