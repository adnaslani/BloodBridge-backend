require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const tokenSecret = process.env.TOKEN_SECRET;

if (isProduction && (!tokenSecret || tokenSecret.length < 32)) {
  throw new Error("TOKEN_SECRET must be set to a value of at least 32 characters in production");
}

const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  port: process.env.PORT || 5002,
  nodeEnv,
  frontendOrigins,
  tokenSecret: tokenSecret || "development-only-token-secret-change-before-deployment",
  tokenExpiresInSeconds: Number(process.env.TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24),

  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
};