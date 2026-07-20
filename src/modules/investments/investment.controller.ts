import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { investmentService } from "./investment.service.js";
import {
  platformSchema,
  instrumentSchema,
  tradeSchema,
  priceSchema,
  dividendSchema,
} from "./investment.schema.js";
export const investmentRouter = Router();
investmentRouter.post(
  "/platforms",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      message: "Platform investasi berhasil ditambahkan",
      data: await investmentService.createPlatform(
        getUserId(req),
        platformSchema.parse(req.body),
      ),
    }),
  ),
);
investmentRouter.get(
  "/platforms",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await investmentService.listPlatforms(getUserId(req)),
    }),
  ),
);
investmentRouter.post(
  "/instruments",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await investmentService.createInstrument(
        getUserId(req),
        instrumentSchema.parse(req.body),
      ),
    }),
  ),
);
investmentRouter.get(
  "/instruments",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await investmentService.listInstruments(getUserId(req)),
    }),
  ),
);
investmentRouter.post(
  "/trades",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      message: "Transaksi investasi berhasil dicatat",
      data: await investmentService.trade(
        getUserId(req),
        tradeSchema.parse(req.body),
      ),
    }),
  ),
);
investmentRouter.post(
  "/prices",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      data: await investmentService.addPrice(
        getUserId(req),
        priceSchema.parse(req.body),
      ),
    }),
  ),
);
investmentRouter.post(
  "/dividends",
  asyncHandler(async (req, res) =>
    res.status(201).json({
      success: true,
      message: "Dividen berhasil dicatat",
      data: await investmentService.addDividend(
        getUserId(req),
        dividendSchema.parse(req.body),
      ),
    }),
  ),
);
investmentRouter.get(
  "/portfolio",
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await investmentService.portfolio(getUserId(req)),
    }),
  ),
);
