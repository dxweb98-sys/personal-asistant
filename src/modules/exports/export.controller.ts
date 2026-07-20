import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { buildExport } from "./export.service.js";
export const exportRouter = Router();
const query = z.object({
  format: z.enum(["csv", "xlsx", "pdf"]).default("xlsx"),
});
exportRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const q = query.parse(req.query);
    const f = await buildExport(getUserId(req), "summary", q.format);
    res.setHeader("Content-Type", f.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${f.filename}"`,
    );
    res.send(f.buffer);
  }),
);
exportRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const q = query.parse(req.query);
    const f = await buildExport(getUserId(req), "payments", q.format);
    res.setHeader("Content-Type", f.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${f.filename}"`,
    );
    res.send(f.buffer);
  }),
);
exportRouter.get(
  "/debts/:id",
  asyncHandler(async (req, res) => {
    const q = query.parse(req.query);
    const f = await buildExport(
      getUserId(req),
      "debt",
      q.format,
      req.params.id,
    );
    res.setHeader("Content-Type", f.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${f.filename}"`,
    );
    res.send(f.buffer);
  }),
);
