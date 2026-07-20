import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { Feature } from "../../config/features.js";
import { getUserId } from "../../common/user-context.js";
import { requireFeature } from "../../middlewares/feature.middleware.js";
import { reportQuerySchema } from "../report/report.schema.js";
import { buildExport, buildFinancialExport } from "./export.service.js";

export const exportRouter = Router();
const legacyQuery = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]).default("xlsx"),
});
const financialExportSchema = z.object({
  format: z.enum(["csv", "xlsx", "pdf", "json"]).default("xlsx"),
  filters: reportQuerySchema.default({
    preset: "THIS_MONTH",
    grouping: "NONE",
    includeCancelled: false,
    includeArchivedAccounts: false,
    page: 1,
    limit: 30,
  }),
});

function sendFile(
  res: any,
  file: { mime: string; filename: string; buffer: Buffer },
) {
  res.setHeader("Content-Type", file.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.filename}"`,
  );
  res.send(file.buffer);
}

exportRouter.post(
  "/financial",
  requireFeature(Feature.GENERAL_REPORTS),
  asyncHandler(async (req, res) => {
    const input = financialExportSchema.parse(req.body);
    sendFile(
      res,
      await buildFinancialExport(getUserId(req), input.filters, input.format),
    );
  }),
);

exportRouter.get(
  "/summary",
  requireFeature(Feature.DEBT_EXPORTS),
  asyncHandler(async (req, res) => {
    const query = legacyQuery.parse(req.query);
    sendFile(res, await buildExport(getUserId(req), "summary", query.format));
  }),
);

exportRouter.get(
  "/payments",
  requireFeature(Feature.DEBT_EXPORTS),
  asyncHandler(async (req, res) => {
    const query = legacyQuery.parse(req.query);
    sendFile(res, await buildExport(getUserId(req), "payments", query.format));
  }),
);

exportRouter.get(
  "/debts/:id",
  requireFeature(Feature.DEBT_EXPORTS),
  asyncHandler(async (req, res) => {
    const query = legacyQuery.parse(req.query);
    sendFile(
      res,
      await buildExport(
        getUserId(req),
        "debt",
        query.format,
        String(req.params.id),
      ),
    );
  }),
);
