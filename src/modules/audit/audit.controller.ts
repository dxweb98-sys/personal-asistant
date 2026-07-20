import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { auditService } from "./audit.service.js";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const auditRouter = Router();

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    res.json({
      success: true,
      data: await auditService.list(getUserId(req), query.limit),
    });
  }),
);
