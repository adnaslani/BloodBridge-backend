const app = require("./app");
const config = require("./config/env");
const pool = require("./config/database");
const { startNotificationWorker } = require("./services/notificationWorker");

async function startServer() {
  try {
    await pool.query("SELECT 1");

    const server = app.listen(config.port, () => {
      console.log(`BloodBridge API running on port ${config.port}`);
      console.log("PostgreSQL connected successfully");
    });
    const stopWorker = config.notificationWorkerEnabled
      ? startNotificationWorker({
        pool,
        webhookUrl: config.notificationWebhookUrl,
        pollMilliseconds: config.notificationWorkerPollMs,
        deliveryMode: config.notificationDeliveryMode,
        snsTopicArn: config.snsNotificationTopicArn,
        region: config.awsRegion,
        webSocketEndpoint: config.webSocketManagementEndpoint,
      })
      : () => {};
    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
      stopWorker();
      server.close(() => pool.end().finally(() => process.exit(0)));
      setTimeout(() => process.exit(1), 30000).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Could not connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();
