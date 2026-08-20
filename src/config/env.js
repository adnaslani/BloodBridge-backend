require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const tokenSecret = process.env.TOKEN_SECRET;
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || null;
const cognitoClientId = process.env.COGNITO_CLIENT_ID || null;
const cognitoRegion = process.env.COGNITO_REGION || process.env.AWS_REGION || null;
const cognitoEnabled = Boolean(cognitoUserPoolId || cognitoClientId || cognitoRegion);
const notificationDeliveryMode = process.env.NOTIFICATION_DELIVERY_MODE || "webhook";

if (cognitoEnabled && (!cognitoUserPoolId || !cognitoClientId || !cognitoRegion)) {
  throw new Error("COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and COGNITO_REGION must be set together");
}

function integerEnv(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

if (isProduction && (!tokenSecret || tokenSecret.length < 32)) {
  throw new Error("TOKEN_SECRET must be set to a value of at least 32 characters in production");
}
if (!["webhook", "sns"].includes(notificationDeliveryMode)) {
  throw new Error("NOTIFICATION_DELIVERY_MODE must be either webhook or sns");
}
if (process.env.NOTIFICATION_WORKER_ENABLED === "true") {
  if (notificationDeliveryMode === "webhook" && !process.env.NOTIFICATION_WEBHOOK_URL) {
    throw new Error("NOTIFICATION_WEBHOOK_URL must be set when NOTIFICATION_DELIVERY_MODE=webhook");
  }
  if (notificationDeliveryMode === "sns" && !process.env.SNS_NOTIFICATION_TOPIC_ARN) {
    throw new Error("SNS_NOTIFICATION_TOPIC_ARN must be set when NOTIFICATION_DELIVERY_MODE=sns");
  }
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
  tokenExpiresInSeconds: integerEnv("TOKEN_EXPIRES_IN_SECONDS", 60 * 60 * 24, 60, 60 * 60 * 24),
  trustProxy: process.env.TRUST_PROXY === "true",
  notificationWorkerEnabled: process.env.NOTIFICATION_WORKER_ENABLED === "true",
  notificationDeliveryMode,
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL || null,
  snsNotificationTopicArn: process.env.SNS_NOTIFICATION_TOPIC_ARN || null,
  awsRegion: process.env.AWS_REGION || cognitoRegion || null,
  webSocketManagementEndpoint: process.env.WEBSOCKET_MANAGEMENT_ENDPOINT || null,
  notificationWorkerPollMs: integerEnv("NOTIFICATION_WORKER_POLL_MS", 5000, 1000, 60000),
  offerExpiryWorkerEnabled: process.env.OFFER_EXPIRY_WORKER_ENABLED !== "false",
  offerExpiryWorkerPollMs: integerEnv("OFFER_EXPIRY_WORKER_POLL_MS", 30000, 5000, 300000),
  cognito: cognitoEnabled ? {
    userPoolId: cognitoUserPoolId,
    clientId: cognitoClientId,
    region: cognitoRegion,
    issuer: `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoUserPoolId}`,
  } : null,

  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: integerEnv("DB_POOL_MAX", 10, 1, 100),
    idleTimeoutMillis: integerEnv("DB_IDLE_TIMEOUT_MS", 30000, 1000, 300000),
    connectionTimeoutMillis: integerEnv("DB_CONNECTION_TIMEOUT_MS", 5000, 1000, 60000),
    statement_timeout: integerEnv("DB_STATEMENT_TIMEOUT_MS", 10000, 1000, 120000),
    ...(process.env.DB_SSL === "true" ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } } : {}),
  },
};
