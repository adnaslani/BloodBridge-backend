const test = require("node:test");
const assert = require("node:assert/strict");
const { emailContent } = require("../src/lambdas/emailNotificationHandler");
const { cognitoSub } = require("../src/lambdas/websocketConnectionHandler");

test("email Lambda uses an offer-specific subject", () => {
  const [subject, body] = emailContent("donor_offer_created", { bloodRequestId: "request-1" });
  assert.match(subject, /donation offer/i);
  assert.match(body, /request-1/);
});

test("websocket handler reads a Cognito subject from either API Gateway authorizer format", () => {
  assert.equal(cognitoSub({ requestContext: { authorizer: { jwt: { claims: { sub: "user-1" } } } } }), "user-1");
  assert.equal(cognitoSub({ requestContext: { authorizer: { claims: { sub: "user-2" } } } }), "user-2");
});
