const test = require("node:test");
const assert = require("node:assert/strict");
const { emailContent } = require("../src/lambdas/emailNotificationHandler");
const { cognitoSub } = require("../src/lambdas/websocketConnectionHandler");
const { policy } = require("../src/lambdas/websocketAuthorizer");

test("email Lambda uses an offer-specific subject", () => {
  const [subject, body] = emailContent("donor_offer_created", { bloodRequestId: "request-1" });
  assert.match(subject, /donation offer/i);
  assert.match(body, /request-1/);
});

test("websocket handler reads a Cognito subject from either API Gateway authorizer format", () => {
  assert.equal(cognitoSub({ requestContext: { authorizer: { sub: "user-0" } } }), "user-0");
  assert.equal(cognitoSub({ requestContext: { authorizer: { jwt: { claims: { sub: "user-1" } } } } }), "user-1");
  assert.equal(cognitoSub({ requestContext: { authorizer: { claims: { sub: "user-2" } } } }), "user-2");
});

test("websocket authorizer generates a scoped API Gateway policy", () => {
  const response = policy("user-1", "Allow", "arn:aws:execute-api:region:account:api/stage/$connect", { role: "donor" });
  assert.equal(response.principalId, "user-1");
  assert.equal(response.policyDocument.Statement[0].Effect, "Allow");
  assert.equal(response.context.role, "donor");
});
