# Cognito migration contract

The API supports two authentication modes during migration:

- **Legacy:** Existing `/api/auth/register` and `/api/auth/login` return a local BloodBridge JWT. Send it as `Authorization: Bearer <token>` as before.
- **Cognito:** The frontend authenticates directly with Cognito and sends its **access token** as `Authorization: Bearer <access-token>` to every API endpoint.

## Required Cognito configuration

Create one Cognito User Pool and one app client. Configure email as the sign-in username, and configure these groups, with each user assigned to exactly one group:

`donor`, `patient`, `hospital`, `admin`.

Use a Pre Token Generation trigger, or the application administration flow, to ensure the user is placed in the correct group before first login. The role is read from the `cognito:groups` claim in the access token. The API intentionally rejects users with no BloodBridge group or with multiple BloodBridge groups.

Set these server-side environment values:

```env
COGNITO_REGION=eu-central-1
COGNITO_USER_POOL_ID=eu-central-1_example
COGNITO_CLIENT_ID=exampleclientid
```

Do not put a Cognito client secret in the static frontend.

## First Cognito login / profile provisioning

After Cognito sign-up is confirmed and the user has an access token, call:

```http
POST /api/auth/cognito/sync
Authorization: Bearer <Cognito access token>
Content-Type: application/json

{
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "bloodType": "A+"
}
```

The email must exactly match the Cognito username. The endpoint creates the corresponding BloodBridge profile, or links an existing legacy profile with the same verified Cognito email. Its response is:

```json
{ "user": { "id": "internal-uuid", "fullName": "Ada Lovelace", "role": "donor" } }
```

`id` remains an internal API/database identifier. Cognito's `sub` is never exposed as the application user ID.

## Login and logout

Use Cognito's hosted UI or Cognito SDK with authorization-code flow plus PKCE. After login, use the Cognito **access token**, not the ID token, in the API authorization header. Logout must clear the Cognito session in the frontend; calling `POST /api/auth/logout` is still valid but only revokes legacy local JWT sessions.
