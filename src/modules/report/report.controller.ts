import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { Feature } from "../../config/features.js";
import { getUserId } from "../../common/user-context.js";
import { requireFeature } from "../../middlewares/feature.middleware.js";
import { recommendationSchema } from "../recommendations/recommendation.schema.js";
import { buildRecommendation } from "../recommendations/recommendation.service.js";
import { getSummary } from "../summary/summary.service.js";
import { reportQuerySchema } from "./report.schema.js";
import { reportService } from "./report.service.js";

export const reportRouter = Router();

function normalizeList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : String(value).split(",");
  const normalized = values
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function normalizeReportQuery(query: Record<string, unknown>) {
  return {
    ...query,
    accountIds: normalizeList(query.accountIds),
    categoryIds: normalizeList(query.categoryIds),
    tagIds: normalizeList(query.tagIds),
    types: normalizeList(query.types),
    statuses: normalizeList(query.statuses),
  };
}

reportRouter.get(
  "/summary",
  requireFeature(Feature.DEBT_REPORTS),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getSummary(getUserId(req)) });
  }),
);

reportRouter.get(
  "/financial",
  requireFeature(Feature.GENERAL_REPORTS),
  asyncHandler(async (req, res) => {
    const query = reportQuerySchema.parse(normalizeReportQuery(req.query));
    res.json({
      success: true,
      data: await reportService.build(getUserId(req), query),
    });
  }),
);

reportRouter.post(
  "/financial",
  requireFeature(Feature.GENERAL_REPORTS),
  asyncHandler(async (req, res) => {
    const query = reportQuerySchema.parse(req.body);
    res.json({
      success: true,
      data: await reportService.build(getUserId(req), query),
    });
  }),
);

reportRouter.post(
  "/recommendations",
  requireFeature(Feature.RECOMMENDATIONS),
  asyncHandler(async (req, res) => {
    const input = recommendationSchema.parse(req.body);
    res.json({
      success: true,
      data: await buildRecommendation(getUserId(req), input),
    });
  }),
);
