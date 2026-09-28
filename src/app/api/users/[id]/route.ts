import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه تغییر حساب دارد." }, { status: 403 });
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return Response.json({ error: "شناسه حساب معتبر نیست." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400 });
  }
  const updates: { active?: boolean; role?: "admin" | "user"; department?: string } = {};
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.role === "admin" || body.role === "user") updates.role = body.role;
  if (typeof body.department === "string" && body.department.trim()) updates.department = body.department.trim().slice(0, 80);
  if (!Object.keys(updates).length) return Response.json({ error: "تغییری برای ذخیره ارسال نشده است." }, { status: 400 });
  if (actor.id === id && updates.active === false) return Response.json({ error: "امکان غیرفعال‌کردن حساب خودتان وجود ندارد." }, { status: 400 });
  const [target] = await db.select({ id: users.id, role: users.role, active: users.active }).from(users).where(eq(users.id, id)).limit(1);
  if (!target) return Response.json({ error: "حساب پیدا نشد." }, { status: 404 });
  const removesActiveAdmin = target.role === "admin" && target.active && (updates.role === "user" || updates.active === false);
  if (removesActiveAdmin) {
    const [{ total }] = await db.select({ total: count() }).from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)));
    if (Number(total) <= 1) return Response.json({ error: "سامانه باید دست‌کم یک مدیر فعال داشته باشد." }, { status: 400 });
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning({
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    department: users.department,
    role: users.role,
    active: users.active,
  });
  if (!updated) return Response.json({ error: "حساب پیدا نشد." }, { status: 404 });
  await writeAuditLog(actor.id, "user.updated", { userId: id, active: updated.active, role: updated.role, department: updated.department });
  return Response.json({ user: updated });
}
