require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5002,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "*",
  tokenSecret: process.env.TOKEN_SECRET || "change-this-development-token-secret",
  tokenExpiresInSeconds: Number(process.env.TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24),

  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
};