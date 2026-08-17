-- Cognito identities are external strings, while users.id remains the internal UUID
-- referenced throughout the existing BloodBridge schema.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cognito_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_cognito_sub_unique_idx
  ON users (cognito_sub)
  WHERE cognito_sub IS NOT NULL;
