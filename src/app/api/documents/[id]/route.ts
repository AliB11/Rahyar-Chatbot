import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه حذف سند دارد." }, { status: 403 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return Response.json({ error: "شناسه سند معتبر نیست." }, { status: 400 });
  const [deleted] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id, title: documents.title });
  if (!deleted) return Response.json({ error: "سند پیدا نشد." }, { status: 404 });
  await writeAuditLog(user.id, "document.deleted", { documentId: deleted.id, title: deleted.title });
  return Response.json({ ok: true });
}
