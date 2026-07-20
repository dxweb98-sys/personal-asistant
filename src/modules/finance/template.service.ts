import { HttpError } from "../../common/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { auditService } from "../audit/audit.service.js";

const db = prisma as any;
const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export const templateService = {
  list(
    userId: string,
    options?: {
      search?: string;
      favorite?: boolean;
      includeInactive?: boolean;
    },
  ) {
    return db.transactionTemplate.findMany({
      where: {
        userId,
        ...(!options?.includeInactive ? { isActive: true } : {}),
        ...(options?.favorite !== undefined
          ? { isFavorite: options.favorite }
          : {}),
        ...(options?.search
          ? {
              OR: [
                { name: { contains: options.search, mode: "insensitive" } },
                { normalizedName: { contains: normalize(options.search) } },
              ],
            }
          : {}),
      },
      orderBy: [
        { isFavorite: "desc" },
        { lastUsedAt: "desc" },
        { usageCount: "desc" },
        { name: "asc" },
      ],
    });
  },

  async create(
    userId: string,
    input: { name: string; payload: unknown; isFavorite?: boolean },
  ) {
    const name = input.name.trim().replace(/\s+/g, " ");
    const row = await db.transactionTemplate.create({
      data: {
        userId,
        name,
        normalizedName: normalize(name),
        payload: input.payload,
        isFavorite: input.isFavorite ?? false,
      },
    });
    await auditService.create(userId, {
      action: "TRANSACTION_TEMPLATE_CREATED",
      entityType: "TransactionTemplate",
      entityId: row.id,
      after: row,
    });
    return row;
  },

  async update(
    userId: string,
    templateId: string,
    input: {
      name?: string | undefined;
      payload?: unknown;
      isFavorite?: boolean | undefined;
      isActive?: boolean | undefined;
    },
  ) {
    const existing = await db.transactionTemplate.findFirst({
      where: { id: templateId, userId },
    });
    if (!existing)
      throw new HttpError(404, "Template transaksi tidak ditemukan");
    const name = input.name?.trim().replace(/\s+/g, " ");
    const updated = await db.transactionTemplate.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name, normalizedName: normalize(name) } : {}),
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        ...(input.isFavorite !== undefined
          ? { isFavorite: input.isFavorite }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await auditService.create(userId, {
      action: "TRANSACTION_TEMPLATE_UPDATED",
      entityType: "TransactionTemplate",
      entityId: existing.id,
      before: existing,
      after: updated,
    });
    return updated;
  },

  async use(userId: string, templateId: string) {
    const template = await db.transactionTemplate.findFirst({
      where: { id: templateId, userId, isActive: true },
    });
    if (!template)
      throw new HttpError(404, "Template transaksi tidak ditemukan");
    return db.transactionTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  },

  async remove(userId: string, templateId: string) {
    return this.update(userId, templateId, { isActive: false });
  },

  history(
    userId: string,
    fieldType: string,
    options?: { search?: string; limit?: number },
  ) {
    return db.transactionFieldHistory.findMany({
      where: {
        userId,
        fieldType,
        ...(options?.search
          ? {
              OR: [
                { value: { contains: options.search, mode: "insensitive" } },
                { normalizedValue: { contains: normalize(options.search) } },
              ],
            }
          : {}),
      },
      orderBy: [
        { isFavorite: "desc" },
        { lastUsedAt: "desc" },
        { usageCount: "desc" },
      ],
      take: options?.limit ?? 10,
    });
  },

  async toggleHistoryFavorite(
    userId: string,
    historyId: string,
    value: boolean,
  ) {
    const row = await db.transactionFieldHistory.findFirst({
      where: { id: historyId, userId },
    });
    if (!row) throw new HttpError(404, "Riwayat input tidak ditemukan");
    return db.transactionFieldHistory.update({
      where: { id: row.id },
      data: { isFavorite: value },
    });
  },

  async createTag(userId: string, nameInput: string) {
    const name = nameInput.trim().replace(/\s+/g, " ");
    return db.tag.upsert({
      where: {
        userId_normalizedName: { userId, normalizedName: normalize(name) },
      },
      create: { userId, name, normalizedName: normalize(name) },
      update: { name },
    });
  },

  listTags(userId: string) {
    return db.tag.findMany({ where: { userId }, orderBy: { name: "asc" } });
  },
};
