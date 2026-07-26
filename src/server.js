const app = require("./app");
const config = require("./config/env");

const server = app.listen(config.port, () => {
  console.log(`BloodBridge API running on port ${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/api/health`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Choose another PORT value and run npm start again.`);
  } else {
    console.error("Unable to start BloodBridge API:", error.message);
  }
  process.exitCode = 1;
});
