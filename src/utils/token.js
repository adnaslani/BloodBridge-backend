const { createHmac, createPublicKey, timingSafeEqual, verify } = require("crypto");
const config = require("../config/env");

const cognitoJwksCache = new Map();
const COGNITO_JWKS_TTL_MS = 60 * 60 * 1000;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value) {
  return createHmac("sha256", config.tokenSecret).update(value).digest("base64url");
}

function createAccessToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, role: user.role, ver: Number(user.tokenVersion || 0), iat: issuedAt, exp: issuedAt + config.tokenExpiresInSeconds };
  const unsignedToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsignedToken}.${sign(unsignedToken)}`;
}

function verifyAccessToken(token) {
  if (typeof token !== "string") return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const expectedSignature = sign(`${header}.${payload}`);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.sub !== "string" || !Number.isInteger(claims.ver) || claims.ver < 0 || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)) return null;
    return claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

function decodeJwtPart(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

function cognitoRole(claims) {
  const groups = Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"] : [];
  const roles = groups.filter((group) => ["donor", "patient", "hospital", "admin"].includes(group));
  return roles.length === 1 ? roles[0] : null;
}

async function getCognitoJwk(kid) {
  const cognito = config.cognito;
  if (!cognito) return null;
  const cached = cognitoJwksCache.get(cognito.issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys.get(kid) || null;

  const response = await fetch(`${cognito.issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Unable to retrieve Cognito signing keys");
  const payload = await response.json();
  if (!Array.isArray(payload.keys)) throw new Error("Cognito signing keys response is invalid");
  const keys = new Map(payload.keys.filter((key) => key?.kid).map((key) => [key.kid, key]));
  cognitoJwksCache.set(cognito.issuer, { keys, expiresAt: Date.now() + COGNITO_JWKS_TTL_MS });
  return keys.get(kid) || null;
}

async function verifyCognitoAccessToken(token) {
  if (!config.cognito || typeof token !== "string") return null;
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  try {
    const header = decodeJwtPart(encodedHeader);
    const claims = decodeJwtPart(encodedPayload);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    if (claims.token_use !== "access" || claims.iss !== config.cognito.issuer || claims.client_id !== config.cognito.clientId) return null;
    if (typeof claims.sub !== "string" || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    const role = cognitoRole(claims);
    if (!role) return null;
    const jwk = await getCognitoJwk(header.kid);
    if (!jwk) return null;
    const valid = verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(encodedSignature, "base64url"));
    return valid ? { ...claims, role } : null;
  } catch {
    return null;
  }
}

module.exports = { createAccessToken, verifyAccessToken, verifyCognitoAccessToken, cognitoRole };
