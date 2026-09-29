import { count, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createUserSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { clearRateLimit, clientIp, isRateLimited, registerAuthFailure } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateKey = `setup:${clientIp(request)}`;
  if (isRateLimited(rateKey)) {
    return Response.json(
      { error: "تلاش‌های راه‌اندازی بیش از حد مجاز است؛ لطفاً چند دقیقه بعد دوباره تلاش کنید." },
      { status: 429 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    registerAuthFailure(rateKey);
    return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 100) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const department = typeof body.department === "string" ? body.department.trim().slice(0, 80) : "ستاد";
  if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || !department) {
    registerAuthFailure(rateKey);
    return Response.json({ error: "نام، ایمیل معتبر و گذرواژه حداقل ۱۰ کاراکتری لازم است." }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(917441)`);
      const [{ total }] = await transaction.select({ total: count() }).from(users);
      if (Number(total) > 0) return { alreadyConfigured: true as const };
      const [user] = await transaction.insert(users).values({
        fullName,
        email,
        passwordHash: hashPassword(password),
        department,
        role: "admin",
      }).returning({ id: users.id, fullName: users.fullName, email: users.email, department: users.department, role: users.role });
      return { user };
    });

    if ("alreadyConfigured" in result) {
      registerAuthFailure(rateKey);
      return Response.json({ error: "مدیر سیستم قبلاً راه‌اندازی شده است." }, { status: 409 });
    }
    clearRateLimit(rateKey);
    await createUserSession(result.user.id);
    await writeAuditLog(result.user.id, "system.initialized", { email: result.user.email });
    return Response.json({ user: result.user }, { status: 201 });
  } catch (error) {
    console.error("Initial admin setup failed", error);
    return Response.json({ error: "راه‌اندازی انجام نشد. ایمیل را بررسی و دوباره تلاش کنید." }, { status: 500 });
  }
}
