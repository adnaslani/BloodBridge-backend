const { verifyCognitoAccessToken } = require("../utils/token");

function policy(principalId, effect, resource, context = {}) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Action: "execute-api:Invoke", Effect: effect, Resource: resource }],
    },
    context,
  };
}

async function handler(event) {
  const authorization = event.headers?.Authorization || event.headers?.authorization || "";
  const [, token] = authorization.split(" ");
  // Browser WebSocket APIs cannot set an Authorization header. The short-lived Cognito
  // access token may therefore be sent as ?token=... during the $connect handshake.
  const suppliedToken = authorization.startsWith("Bearer ") ? token : event.queryStringParameters?.token;
  const claims = await verifyCognitoAccessToken(suppliedToken);
  if (!claims) return policy("unauthorized", "Deny", event.methodArn);
  return policy(claims.sub, "Allow", event.methodArn, { sub: claims.sub, role: claims.role });
}

module.exports = { handler, policy };
