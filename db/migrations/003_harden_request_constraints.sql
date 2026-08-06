ALTER TABLE blood_requests
  DROP CONSTRAINT IF EXISTS blood_requests_units_needed_check;

ALTER TABLE blood_requests
  ADD CONSTRAINT blood_requests_units_needed_check
  CHECK (units_needed BETWEEN 1 AND 25);

CREATE INDEX IF NOT EXISTS donor_profiles_available_coordinates_idx
  ON donor_profiles (latitude, longitude)
  WHERE is_available = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL;