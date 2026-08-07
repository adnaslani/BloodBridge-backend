const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccessToken, verifyAccessToken } = require("../src/utils/token");

test("access tokens carry a session version for revocation", () => {
  const token = createAccessToken({ id: "user-1", role: "donor", tokenVersion: 3 });
  assert.equal(verifyAccessToken(token).ver, 3);
});
