import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { insightService } from "./insight.service.js";
export const insightRouter = Router();
insightRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await insightService.dashboard(getUserId(req)),
    }),
  ),
);
