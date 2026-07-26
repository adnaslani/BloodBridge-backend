require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "*",
  tokenSecret: process.env.TOKEN_SECRET || "change-this-development-token-secret",
  tokenExpiresInSeconds: Number(process.env.TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24),
};