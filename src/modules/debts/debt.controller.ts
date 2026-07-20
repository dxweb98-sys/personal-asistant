import { Router } from "express";
import { DebtStatus } from "../../generated/prisma/client.js";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import {
  adjustmentSchema,
  chargeSchema,
  createDebtSchema,
  createInstallmentSchema,
  negotiationSchema,
  paymentSchema,
  planLateSchema,
  updateDebtSchema,
} from "./debt.schema.js";
import { debtService } from "./debt.service.js";
export const debtRouter = Router();
debtRouter.get(
  "/",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await debtService.list(
        getUserId(req),
        req.query.status as DebtStatus | undefined,
      ),
    }),
  ),
);
debtRouter.post(
  "/",
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        message: "Utang berhasil ditambahkan",
        data: await debtService.create(
          getUserId(req),
          createDebtSchema.parse(req.body),
        ),
      }),
  ),
);
debtRouter.get(
  "/:id",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await debtService.find(getUserId(req), String(req.params.id)),
    }),
  ),
);
debtRouter.patch(
  "/:id",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      message: "Utang berhasil diperbarui",
      data: await debtService.update(
        getUserId(req),
        String(req.params.id),
        updateDebtSchema.parse(req.body),
      ),
    }),
  ),
);
debtRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await debtService.remove(getUserId(req), String(req.params.id));
    res.status(204).send();
  }),
);
debtRouter.post(
  "/:id/installments",
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        message: "Tagihan periode berhasil dibuat",
        data: await debtService.createInstallment(
          getUserId(req),
          String(req.params.id),
          createInstallmentSchema.parse(req.body),
        ),
      }),
  ),
);
debtRouter.post(
  "/:id/installments/:installmentId/plan-late",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      message: "Rencana keterlambatan dicatat",
      data: await debtService.planLate(
        getUserId(req),
        String(req.params.id),
        String(req.params.installmentId),
        planLateSchema.parse(req.body),
      ),
    }),
  ),
);
debtRouter.post(
  "/:id/installments/:installmentId/adjustments",
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        message: "Penyesuaian tagihan dicatat",
        data: await debtService.adjustInstallment(
          getUserId(req),
          String(req.params.id),
          String(req.params.installmentId),
          adjustmentSchema.parse(req.body),
        ),
      }),
  ),
);
debtRouter.post(
  "/:id/charges",
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        message: "Denda/biaya berhasil dicatat",
        data: await debtService.addCharge(
          getUserId(req),
          String(req.params.id),
          chargeSchema.parse(req.body),
        ),
      }),
  ),
);
debtRouter.post(
  "/:id/negotiations",
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        message: "Hasil negosiasi berhasil dicatat",
        data: await debtService.negotiate(
          getUserId(req),
          String(req.params.id),
          negotiationSchema.parse(req.body),
        ),
      }),
  ),
);
debtRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        message: "Pembayaran berhasil dicatat",
        data: await debtService.pay(
          getUserId(req),
          String(req.params.id),
          paymentSchema.parse(req.body),
        ),
      }),
  ),
);
