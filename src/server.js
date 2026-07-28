const app = require("./app");
const config = require("./config/env");
const pool = require("./config/database");

async function startServer() {
  try {
    await pool.query("SELECT 1");

    app.listen(config.port, () => {
      console.log(`BloodBridge API running on port ${config.port}`);
      console.log("PostgreSQL connected successfully");
    });
  } catch (error) {
    console.error("Could not connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();
