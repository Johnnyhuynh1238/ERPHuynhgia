import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AdminAuditEntity = "inbox_item" | "customer_pipeline_meta";

export type AdminAuditAction =
  | "create"
  | "update"
  | "mark_done"
  | "convert"
  | "delete";

export type AdminAuditInput = {
  actorId: string | null;
  entity: AdminAuditEntity;
  entityId?: string | null;
  action: AdminAuditAction;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

export async function logAdminAudit(db: DbClient, input: AdminAuditInput) {
  await db.adminAuditLog.create({
    data: {
      actorId: input.actorId,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      metadata:
        input.metadata == null
          ? Prisma.JsonNull
          : (input.metadata as Prisma.InputJsonValue),
    },
  });
}
