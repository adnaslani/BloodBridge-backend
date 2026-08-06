CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) > 0),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('donor', 'patient')),
  blood_type TEXT NOT NULL CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  phone TEXT,
  city TEXT,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  sms_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  share_location_automatically BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  notification_radius_km SMALLINT NOT NULL DEFAULT 15 CHECK (notification_radius_km BETWEEN 5 AND 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE TABLE IF NOT EXISTS blood_requests (
  id UUID PRIMARY KEY,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_name TEXT NOT NULL CHECK (char_length(trim(patient_name)) > 0),
  blood_type TEXT NOT NULL CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  units_needed INTEGER NOT NULL CHECK (units_needed BETWEEN 1 AND 100),
  urgency TEXT NOT NULL CHECK (urgency IN ('normal', 'urgent', 'critical')),
  hospital_name TEXT NOT NULL CHECK (char_length(trim(hospital_name)) > 0),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'fulfilled', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blood_request_id UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'interested' CHECK (status IN ('interested', 'accepted', 'declined', 'completed')),
  units_donated SMALLINT CHECK (units_donated IS NULL OR units_donated BETWEEN 1 AND 25),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (blood_request_id, donor_user_id)
);

CREATE INDEX IF NOT EXISTS blood_requests_creator_idx ON blood_requests (created_by_user_id);
CREATE INDEX IF NOT EXISTS blood_requests_status_created_at_idx ON blood_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS blood_requests_blood_type_idx ON blood_requests (blood_type);
CREATE INDEX IF NOT EXISTS donor_profiles_available_idx ON donor_profiles (is_available) WHERE is_available = TRUE;
CREATE INDEX IF NOT EXISTS request_responses_donor_idx ON request_responses (donor_user_id);
