import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "این بخش فقط برای مدیر سیستم است." }, { status: 403 });
  const results = await db.select({
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    department: users.department,
    role: users.role,
    active: users.active,
    createdAt: users.createdAt,
  }).from(users).orderBy(asc(users.department), asc(users.fullName));
  return Response.json({ users: results });
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه ساخت حساب دارد." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400 });
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 100) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const department = typeof body.department === "string" ? body.department.trim().slice(0, 80) : "";
  const role = body.role === "admin" ? "admin" : "user";
  if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || !department) {
    return Response.json({ error: "نام، ایمیل معتبر، واحد سازمانی و گذرواژه حداقل ۱۰ کاراکتری لازم است." }, { status: 400 });
  }

  try {
    const [created] = await db.insert(users).values({
      fullName,
      email,
      passwordHash: hashPassword(password),
      department,
      role,
    }).returning({ id: users.id, fullName: users.fullName, email: users.email, department: users.department, role: users.role, active: users.active });
    await writeAuditLog(actor.id, "user.created", { userId: created.id, email, role, department });
    return Response.json({ user: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("unique")) {
      return Response.json({ error: "این ایمیل قبلاً ثبت شده است." }, { status: 409 });
    }
    console.error("User creation failed", error);
    return Response.json({ error: "ساخت حساب انجام نشد." }, { status: 500 });
  }
}
