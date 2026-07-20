import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { getUserId } from "../../common/user-context.js";
import { settingsService } from "./settings.service.js";

const settingsPatchSchema = z.object({
  baseCurrency: z.string().min(3).max(5).optional(),
  language: z.enum(["id", "en"]).optional(),
  countryCode: z.enum(["ID", "US", "SG", "GB", "JP", "DE"]).optional(),
  timeZone: z.string().min(3).max(64).optional(),
  weekStartsOn: z.coerce.number().int().min(0).max(6).optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  reportConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  defaultAccountId: z.string().uuid().nullable().optional(),
  telegramTheme: z.string().optional(),
  showMotivation: z.boolean().optional(),
  compactNumbers: z.boolean().optional(),
  fxStaleHours: z.coerce.number().int().positive().optional(),
  onboardingCompleted: z.boolean().optional(),
});

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await settingsService.get(getUserId(req)) });
  }),
);

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      message: "Pengaturan berhasil diperbarui",
      data: await settingsService.update(
        getUserId(req),
        settingsPatchSchema.parse(req.body),
        "API",
      ),
    });
  }),
);
