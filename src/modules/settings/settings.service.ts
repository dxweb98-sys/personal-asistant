import { HttpError } from "../../common/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { getTelegramTheme } from "../telegram/themes/index.js";

export const defaultPreference = {
  baseCurrency: "IDR",
  language: "id",
  countryCode: "ID",
  timeZone: "Asia/Jakarta",
  weekStartsOn: 1,
  notificationsEnabled: true,
  notificationConfig: {
    debtDueReminder: true,
    weeklyReport: false,
    monthlyReport: true,
  },
  reportConfig: {
    defaultPeriod: "THIS_MONTH",
    defaultGrouping: "NONE",
    includeCancelled: false,
  },
  defaultAccountId: null as string | null,
  telegramConfigVersion: 1,
  priceStorageMode: "LATEST_ONLY" as const,
  confirmBeforePriceRefresh: true,
  createSnapshotAfterRefresh: false,
  stockStaleHours: 24,
  cryptoStaleHours: 6,
  goldStaleHours: 24,
  telegramTheme: "FRIENDLY" as const,
  showMotivation: true,
  compactNumbers: false,
  fxStaleHours: 24,
  onboardingCompleted: false,
  fixedMonthlyIncome: 0,
  mandatoryMonthlyExpenses: 0,
  debtSafetyBuffer: 0,
};

type PreferenceDefaults = typeof defaultPreference;

export type PreferencePatch = {
  [
    K in Exclude<
      keyof PreferenceDefaults,
      "telegramTheme" | "notificationConfig" | "reportConfig"
    >
  ]?: PreferenceDefaults[K] | undefined;
} & {
  telegramTheme?: string | undefined;
  notificationConfig?: Record<string, unknown> | null | undefined;
  reportConfig?: Record<string, unknown> | null | undefined;
};

const allowedLanguages = new Set(["id", "en"]);
const allowedCountries = new Set(["ID", "US", "SG", "GB", "JP", "DE"]);

function normalizePreference(row: any) {
  const theme = getTelegramTheme(row?.telegramTheme);
  return {
    ...row,
    language: allowedLanguages.has(row?.language) ? row.language : "id",
    countryCode: allowedCountries.has(row?.countryCode)
      ? row.countryCode
      : "ID",
    telegramTheme: theme.key,
    timeZone: row?.timeZone || "Asia/Jakarta",
    weekStartsOn:
      Number.isInteger(row?.weekStartsOn) &&
      row.weekStartsOn >= 0 &&
      row.weekStartsOn <= 6
        ? row.weekStartsOn
        : 1,
  };
}

async function validateDefaultAccount(
  userId: string,
  accountId: string | null,
) {
  if (!accountId) return;
  const account = await (prisma as any).financialAccount.findFirst({
    where: { id: accountId, userId, status: "ACTIVE", isActive: true },
  });
  if (!account) {
    throw new HttpError(
      400,
      "Default account harus merupakan account aktif milik pengguna",
    );
  }
}

export const settingsService = {
  async get(userId: string) {
    const row = await (prisma as any).userFinancePreference.upsert({
      where: { userId },
      create: { userId, ...defaultPreference },
      update: {},
      include: { defaultAccount: true },
    });
    const normalized = normalizePreference(row);
    if (
      normalized.telegramTheme !== row.telegramTheme ||
      normalized.language !== row.language ||
      normalized.countryCode !== row.countryCode ||
      normalized.timeZone !== row.timeZone ||
      normalized.weekStartsOn !== row.weekStartsOn
    ) {
      return (prisma as any).userFinancePreference.update({
        where: { userId },
        data: {
          telegramTheme: normalized.telegramTheme,
          language: normalized.language,
          countryCode: normalized.countryCode,
          timeZone: normalized.timeZone,
          weekStartsOn: normalized.weekStartsOn,
        },
        include: { defaultAccount: true },
      });
    }
    return normalized;
  },

  async update(userId: string, data: PreferencePatch, actor = "USER") {
    if (data.defaultAccountId !== undefined) {
      await validateDefaultAccount(userId, data.defaultAccountId);
    }
    if (
      data.weekStartsOn !== undefined &&
      (data.weekStartsOn < 0 || data.weekStartsOn > 6)
    ) {
      throw new HttpError(
        400,
        "weekStartsOn harus berada pada rentang 0 sampai 6",
      );
    }
    if (data.language && !allowedLanguages.has(data.language)) {
      throw new HttpError(400, "Bahasa belum didukung");
    }
    if (data.countryCode && !allowedCountries.has(data.countryCode)) {
      throw new HttpError(400, "Negara atau wilayah belum didukung");
    }
    const previous = await this.get(userId);
    const theme = data.telegramTheme
      ? getTelegramTheme(data.telegramTheme).key
      : previous.telegramTheme;
    const payload = {
      ...data,
      ...(data.telegramTheme !== undefined ? { telegramTheme: theme } : {}),
    };
    const updated = await (prisma as any).userFinancePreference.upsert({
      where: { userId },
      create: { userId, ...defaultPreference, ...payload },
      update: payload,
      include: { defaultAccount: true },
    });
    await auditService.create(userId, {
      action: "SETTINGS_UPDATED",
      entityType: "UserFinancePreference",
      entityId: updated.id,
      before: previous,
      after: updated,
      metadata: { actor },
    });
    return normalizePreference(updated);
  },

  async getByTelegramChatId(chatId: bigint) {
    const user = await (prisma as any).user.findUnique({
      where: { telegramChatId: chatId },
    });
    if (!user) return null;
    return { user, preference: await this.get(user.id) };
  },

  async updateTelegramProfile(
    userId: string,
    data: {
      language?: string;
      countryCode?: string;
      baseCurrency?: string;
      telegramTheme?: string;
      timeZone?: string;
      onboardingCompleted?: boolean;
    },
  ) {
    return this.update(userId, data, "TELEGRAM");
  },

  async markTelegramCallbackProcessed(
    userId: string,
    callbackId: string,
    action: string,
  ): Promise<boolean> {
    try {
      await (prisma as any).telegramProcessedCallback.create({
        data: { userId, callbackId, action },
      });
      return true;
    } catch (error: any) {
      if (error?.code === "P2002") return false;
      throw error;
    }
  },
};
