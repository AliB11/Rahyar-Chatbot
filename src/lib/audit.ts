import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function writeAuditLog(
  actorId: string | null,
  action: string,
  details: Record<string, string | number | boolean | null> = {},
) {
  await db.insert(auditLogs).values({ actorId, action, details });
}
