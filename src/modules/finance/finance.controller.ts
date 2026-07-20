import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import {
  accountArchiveSchema,
  accountSchema,
  categorySchema,
  historyQuerySchema,
  tagSchema,
  templateSchema,
  templateUpdateSchema,
  transactionCancelSchema,
  transactionListSchema,
  transactionSchema,
} from "./finance.schema.js";
import { financeService } from "./finance.service.js";
import { templateService } from "./template.service.js";

export const financeRouter = Router();

financeRouter.post(
  "/accounts",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await financeService.createAccount(getUserId(req), accountSchema.parse(req.body)),
    }),
  ),
);

financeRouter.get(
  "/accounts",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await financeService.listAccounts(
        getUserId(req),
        String(req.query.includeArchived ?? "false") === "true",
      ),
    }),
  ),
);

financeRouter.get(
  "/accounts/:id/archive-targets",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await financeService.recommendArchiveTargets(getUserId(req), String(req.params.id)),
    }),
  ),
);

financeRouter.post(
  "/accounts/:id/archive",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      message: "Account berhasil diarsipkan",
      data: await financeService.archiveAccount(
        getUserId(req),
        String(req.params.id),
        accountArchiveSchema.parse(req.body),
      ),
    }),
  ),
);

financeRouter.post(
  "/accounts/:id/restore",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      message: "Account berhasil dipulihkan",
      data: await financeService.restoreAccount(getUserId(req), String(req.params.id)),
    }),
  ),
);

financeRouter.post(
  "/categories",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await financeService.createCategory(getUserId(req), categorySchema.parse(req.body)),
    }),
  ),
);

financeRouter.post(
  "/transactions",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      message: "Transaksi berhasil dicatat",
      data: await financeService.record(getUserId(req), transactionSchema.parse(req.body)),
    }),
  ),
);

financeRouter.get(
  "/transactions",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await financeService.listTransactions(
        getUserId(req),
        transactionListSchema.parse(req.query),
      ),
    }),
  ),
);

financeRouter.post(
  "/transactions/:id/cancel",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      message: "Transaksi berhasil dibatalkan dan saldo telah dipulihkan",
      data: await financeService.cancelTransaction(
        getUserId(req),
        String(req.params.id),
        transactionCancelSchema.parse(req.body),
      ),
    }),
  ),
);

financeRouter.get(
  "/cashflow",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    res.json({
      success: true,
      data: await financeService.cashflow(getUserId(req), from, to),
    });
  }),
);

financeRouter.get(
  "/templates",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await templateService.list(getUserId(req), {
        ...(req.query.search ? { search: String(req.query.search) } : {}),
        ...(req.query.favorite !== undefined
          ? { favorite: String(req.query.favorite) === "true" }
          : {}),
        includeInactive: String(req.query.includeInactive ?? "false") === "true",
      }),
    }),
  ),
);

financeRouter.post(
  "/templates",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await templateService.create(getUserId(req), templateSchema.parse(req.body)),
    }),
  ),
);

financeRouter.patch(
  "/templates/:id",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await templateService.update(
        getUserId(req),
        String(req.params.id),
        templateUpdateSchema.extend({ isActive: z.boolean().optional() }).parse(req.body),
      ),
    }),
  ),
);

financeRouter.post(
  "/templates/:id/use",
  asyncHandler(async (req, res) =>
    res.json({ success: true, data: await templateService.use(getUserId(req), String(req.params.id)) }),
  ),
);

financeRouter.delete(
  "/templates/:id",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      message: "Template berhasil dinonaktifkan",
      data: await templateService.remove(getUserId(req), String(req.params.id)),
    }),
  ),
);

financeRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const query = historyQuerySchema.parse(req.query);
    res.json({
      success: true,
      data: await templateService.history(getUserId(req), query.fieldType, {
        ...(query.search !== undefined ? { search: query.search } : {}),
        limit: query.limit,
      }),
    });
  }),
);

financeRouter.patch(
  "/history/:id/favorite",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await templateService.toggleHistoryFavorite(
        getUserId(req),
        String(req.params.id),
        z.object({ value: z.boolean() }).parse(req.body).value,
      ),
    }),
  ),
);

financeRouter.get(
  "/tags",
  asyncHandler(async (req, res) =>
    res.json({ success: true, data: await templateService.listTags(getUserId(req)) }),
  ),
);

financeRouter.post(
  "/tags",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await templateService.createTag(getUserId(req), tagSchema.parse(req.body).name),
    }),
  ),
);
