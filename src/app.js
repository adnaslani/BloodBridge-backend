const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const bloodRequestRoutes = require("./routes/bloodRequestRoutes");
const donorRoutes = require("./routes/donorRoutes");
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const config = require("./config/env");
const pool = require("./config/database");
const { randomUUID } = require("crypto");

const app = express();

if (config.trustProxy) app.set("trust proxy", 1);
app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header include mobile clients and server-to-server calls.
      if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true);
      const error = new Error("Origin is not allowed by CORS");
      error.statusCode = 403;
      return callback(error);
    },
  }),
);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again later." },
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "BloodBridge API" });
});

app.get("/api/ready", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      service: "BloodBridge API",
    });
  } catch (error) {
    error.statusCode = 503;
    next(error);
  }
});

app.use("/api/blood-requests", bloodRequestRoutes);
app.use("/api/donors", donorRoutes);
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/profile", profileRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
