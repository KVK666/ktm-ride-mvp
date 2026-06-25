require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");

const authRoutes = require("./routes/auth");
const rideRoutes = require("./routes/rides");
const dashboardRoutes = require("./routes/dashboard");
const analyticsRoutes = require("./routes/analytics");
const reportRoutes = require("./routes/reports");
const journalRoutes = require("./routes/journal");

const app = express();
const port = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ktm-ride-backend",
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "local"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/reports", reportRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }

  console.error(error);
  return res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`RidePulse backend listening on port ${port}`);
});
