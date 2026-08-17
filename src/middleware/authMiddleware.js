const { verifyAccessToken, verifyCognitoAccessToken } = require("../utils/token");
const authService = require("../services/authService");

async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer") return res.status(401).json({ message: "A valid Bearer access token is required" });
  const legacyClaims = verifyAccessToken(token);
  try {
    if (legacyClaims) {
      req.user = await authService.getAuthenticatedUserById(legacyClaims.sub);
      if (req.user.tokenVersion !== legacyClaims.ver) {
        return res.status(401).json({ message: "This access token has been revoked" });
      }
      req.auth = { provider: "legacy" };
    } else {
      const cognitoClaims = await verifyCognitoAccessToken(token);
      if (!cognitoClaims) return res.status(401).json({ message: "A valid Bearer access token is required" });
      req.user = await authService.getAuthenticatedUserByCognitoSub(cognitoClaims.sub);
      if (req.user.role !== cognitoClaims.role) return res.status(401).json({ message: "Cognito role does not match the BloodBridge profile" });
      req.auth = { provider: "cognito", claims: cognitoClaims };
    }
    if (req.auth.provider === "legacy" && req.user.tokenVersion !== legacyClaims.ver) {
      return res.status(401).json({ message: "This access token has been revoked" });
    }
    delete req.user.tokenVersion;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireCognitoAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer") return res.status(401).json({ message: "A Cognito Bearer access token is required" });
  const claims = await verifyCognitoAccessToken(token);
  if (!claims) return res.status(401).json({ message: "A valid Cognito access token is required" });
  req.auth = { provider: "cognito", claims };
  return next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action" });
    return next();
  };
}

module.exports = { requireAuth, requireCognitoAuth, allowRoles };
