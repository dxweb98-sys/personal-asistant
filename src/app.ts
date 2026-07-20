import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { debtRouter } from "./modules/debts/debt.controller.js";
import { reportRouter } from "./modules/report/report.controller.js";
import { exportRouter } from "./modules/exports/export.controller.js";
import { financeRouter } from "./modules/finance/finance.controller.js";
import { investmentRouter } from "./modules/investments/investment.controller.js";
import { insightRouter } from "./modules/insights/insight.controller.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

export const app = express();
app.use(helmet());
// Configure CORS with a whitelist. Set CORS_ORIGIN env var to a comma-separated list of allowed origins.
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN || "http://localhost:3000").split(","),
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("CORS policy: Origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/health", (_req, res) =>
  res.json({ success: true, service: "personal-finance-os" }),
);
app.use("/api/v1/debts", debtRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/exports", exportRouter);
app.use("/api/v1/finance", financeRouter);
app.use("/api/v1/investments", investmentRouter);
app.use("/api/v1/insights", insightRouter);
app.use((_req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use(errorMiddleware);
