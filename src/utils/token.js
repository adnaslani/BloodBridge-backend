const { createHmac, timingSafeEqual } = require("crypto");
const config = require("../config/env");

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value) {
  return createHmac("sha256", config.tokenSecret).update(value).digest("base64url");
}

function createAccessToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, role: user.role, iat: issuedAt, exp: issuedAt + config.tokenExpiresInSeconds };
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
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

module.exports = { createAccessToken, verifyAccessToken };