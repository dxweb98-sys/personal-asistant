import { prisma } from "../../lib/prisma.js";

export const defaultPreference = {
  baseCurrency: "IDR",
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
};

export const settingsService = {
  get(userId: string) {
    return prisma.userFinancePreference.upsert({
      where: { userId },
      create: { userId, ...defaultPreference },
      update: {},
    });
  },
  update(userId: string, data: Partial<typeof defaultPreference>) {
    return prisma.userFinancePreference.upsert({
      where: { userId },
      create: { userId, ...defaultPreference, ...data },
      update: data,
    });
  },
};
