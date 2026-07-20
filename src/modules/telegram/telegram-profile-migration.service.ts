import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../../lib/prisma.js";
import { settingsService } from "../settings/settings.service.js";
import { getTelegramTheme } from "./themes/index.js";

type LegacyProfile = {
  country?: string;
  language?: string;
  currency?: string;
  theme?: string;
  onboardingCompleted?: boolean;
};

const LEGACY_PROFILE_VERSION = 2;

export async function migrateLegacyTelegramProfiles() {
  const path = join(process.cwd(), "data", "telegram-profiles.json");
  let profiles: Record<string, LegacyProfile>;
  try {
    profiles = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      LegacyProfile
    >;
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn(
        "Legacy Telegram profile migration skipped:",
        error?.message ?? error,
      );
    }
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;
  for (const [chatIdText, legacy] of Object.entries(profiles)) {
    if (!/^\d+$/.test(chatIdText)) {
      skipped += 1;
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { telegramChatId: BigInt(chatIdText) },
    });
    if (!user) {
      skipped += 1;
      continue;
    }
    const current: any = await settingsService.get(user.id);
    if (Number(current.telegramConfigVersion ?? 1) >= LEGACY_PROFILE_VERSION) {
      skipped += 1;
      continue;
    }
    await settingsService.update(
      user.id,
      {
        ...(legacy.country ? { countryCode: legacy.country } : {}),
        ...(legacy.language ? { language: legacy.language } : {}),
        ...(legacy.currency
          ? { baseCurrency: legacy.currency.toUpperCase() }
          : {}),
        ...(legacy.theme
          ? { telegramTheme: getTelegramTheme(legacy.theme).key }
          : {}),
        ...(legacy.onboardingCompleted !== undefined
          ? { onboardingCompleted: legacy.onboardingCompleted }
          : {}),
        telegramConfigVersion: LEGACY_PROFILE_VERSION,
      },
      "MIGRATION",
    );
    migrated += 1;
  }
  return { migrated, skipped };
}
