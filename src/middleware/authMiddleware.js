const { verifyAccessToken } = require("../utils/token");
const authService = require("../services/authService");

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  const claims = scheme === "Bearer" ? verifyAccessToken(token) : null;
  if (!claims) return res.status(401).json({ message: "A valid Bearer access token is required" });
  try {
    req.user = authService.getPublicUserById(claims.sub);
    return next();
  } catch (error) {
    return next(error);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action" });
    return next();
  };
}

module.exports = { requireAuth, allowRoles };