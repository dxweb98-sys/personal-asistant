import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { getSummary } from "../summary/summary.service.js";
import { recommendationSchema } from "../recommendations/recommendation.schema.js";
import { buildRecommendation } from "../recommendations/recommendation.service.js";

export const reportRouter = Router();
reportRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getSummary(getUserId(req)) });
  }),
);
reportRouter.post(
  "/recommendations",
  asyncHandler(async (req, res) => {
    const input = recommendationSchema.parse(req.body);
    res.json({
      success: true,
      data: await buildRecommendation(getUserId(req), input),
    });
  }),
);
