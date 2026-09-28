import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه حذف سند دارد." }, { status: 403 });
  const { id } = await params;
  const [deleted] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id, title: documents.title });
  if (!deleted) return Response.json({ error: "سند پیدا نشد." }, { status: 404 });
  await writeAuditLog(user.id, "document.deleted", { documentId: deleted.id, title: deleted.title });
  return Response.json({ ok: true });
}
