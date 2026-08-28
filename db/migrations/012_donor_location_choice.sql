ALTER TABLE donor_profiles
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE donor_profiles
  DROP CONSTRAINT IF EXISTS donor_profiles_location_source_check;

ALTER TABLE donor_profiles
  ADD CONSTRAINT donor_profiles_location_source_check
  CHECK (location_source IS NULL OR location_source IN ('gps', 'manual'));

ALTER TABLE donor_profiles
  DROP CONSTRAINT IF EXISTS donor_profiles_location_label_length_check;

ALTER TABLE donor_profiles
  ADD CONSTRAINT donor_profiles_location_label_length_check
  CHECK (location_label IS NULL OR char_length(location_label) BETWEEN 1 AND 200);
