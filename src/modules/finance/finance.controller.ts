import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { financeService } from "./finance.service.js";
import {
  accountSchema,
  categorySchema,
  transactionSchema,
} from "./finance.schema.js";
export const financeRouter = Router();
financeRouter.post(
  "/accounts",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await financeService.createAccount(
        getUserId(req),
        accountSchema.parse(req.body),
      ),
    }),
  ),
);
financeRouter.get(
  "/accounts",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await financeService.listAccounts(getUserId(req)),
    }),
  ),
);
financeRouter.post(
  "/categories",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await financeService.createCategory(
        getUserId(req),
        categorySchema.parse(req.body),
      ),
    }),
  ),
);
financeRouter.post(
  "/transactions",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      message: "Transaksi berhasil dicatat",
      data: await financeService.record(
        getUserId(req),
        transactionSchema.parse(req.body),
      ),
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
        req.query.from ? new Date(String(req.query.from)) : undefined,
        req.query.to ? new Date(String(req.query.to)) : undefined,
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
