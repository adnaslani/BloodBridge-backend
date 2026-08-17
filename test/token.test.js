const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccessToken, verifyAccessToken, cognitoRole } = require("../src/utils/token");

test("access tokens carry a session version for revocation", () => {
  const token = createAccessToken({ id: "user-1", role: "donor", tokenVersion: 3 });
  assert.equal(verifyAccessToken(token).ver, 3);
});

test("Cognito role is accepted only when exactly one BloodBridge group is present", () => {
  assert.equal(cognitoRole({ "cognito:groups": ["donor"] }), "donor");
  assert.equal(cognitoRole({ "cognito:groups": ["donor", "admin"] }), null);
  assert.equal(cognitoRole({ "cognito:groups": ["other"] }), null);
});
