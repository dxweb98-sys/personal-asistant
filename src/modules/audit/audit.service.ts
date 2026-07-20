import { prisma } from "../../lib/prisma.js";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

const jsonSafe = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
};

export const auditService = {
  create(userId: string, input: AuditInput, tx: any = prisma) {
    return (tx as any).auditLog.create({
      data: {
        userId,
        action: input.action,
        entityType: input.entityType,
        ...(input.entityId ? { entityId: input.entityId } : {}),
        ...(input.before !== undefined
          ? { before: jsonSafe(input.before) }
          : {}),
        ...(input.after !== undefined ? { after: jsonSafe(input.after) } : {}),
        ...(input.metadata ? { metadata: jsonSafe(input.metadata) } : {}),
      },
    });
  },

  list(userId: string, limit = 100) {
    return (prisma as any).auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
    });
  },
};
