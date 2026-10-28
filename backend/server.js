require("dotenv").config();

const path = require("node:path");
const express = require("express");
const { closePool, withConnection } = require("./config/database");
const { asyncRoute, errorHandler } = require("./lib/errors");
const schedulesRouter = require("./routes/schedules");
const bookingsRouter = require("./routes/bookings");
const adminRouter = require("./routes/admin");

const app = express();
const port = Number(process.env.PORT || 3001);

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use("/api", (request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

app.get("/favicon.ico", (request, response) => response.status(204).end());

app.get("/api/health", asyncRoute(async (request, response) => {
  const required = ["ORACLE_USER", "ORACLE_PASSWORD", "ORACLE_CONNECT_STRING"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    return response.json({
      app: "ok",
      oracle: "not_configured",
      code: "ORACLE_NOT_CONFIGURED",
      message: `Set ${missing.join(", ")} in .env to enable database-backed features.`
    });
  }
  await withConnection((connection) => connection.execute("SELECT 1 FROM dual"));
  response.json({ app: "ok", oracle: "connected" });
}));

app.use("/api", schedulesRouter);
app.use("/api", bookingsRouter);
app.use("/api/admin", adminRouter);

app.use("/api", (request, response) => {
  response.status(404).json({ error: true, code: "API_NOT_FOUND", message: "API endpoint not found." });
});

app.use(express.static(path.resolve(__dirname, "..", "frontend"), { extensions: ["html"] }));

app.use((error, request, response, next) => {
  if (request.path.startsWith("/api")) return errorHandler(error, request, response, next);
  next(error);
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Saarthi is running at http://127.0.0.1:${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing Oracle pool.`);
  await closePool();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT").catch((error) => {
  console.error("Failed to close Oracle pool after SIGINT.", error);
  process.exit(1);
}));
process.once("SIGTERM", () => shutdown("SIGTERM").catch((error) => {
  console.error("Failed to close Oracle pool after SIGTERM.", error);
  process.exit(1);
}));
