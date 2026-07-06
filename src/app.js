const express = require("express");
const cors = require("cors");
const bloodRequestRoutes = require("./routes/bloodRequestRoutes");
const donorRoutes = require("./routes/donorRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const config = require("./config/env");

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin,
  }),
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "BloodBridge API",
  });
});

app.use("/api/blood-requests", bloodRequestRoutes);
app.use("/api/donors", donorRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
