import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { createUserSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/security";
import { clearRateLimit, clientIp, isRateLimited, registerAuthFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 256) {
    return Response.json({ error: "ایمیل یا گذرواژه نادرست است." }, { status: 401 });
  }

  const rateKey = `login:${clientIp(request)}`;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    registerAuthFailure(rateKey);
    if (isRateLimited(rateKey)) {
      return Response.json(
        { error: "تلاش‌های ورود بیش از حد مجاز است؛ لطفاً چند دقیقه بعد دوباره تلاش کنید." },
        { status: 429 },
      );
    }
    return Response.json({ error: "ایمیل یا گذرواژه نادرست است، یا حساب غیرفعال است." }, { status: 401 });
  }

  clearRateLimit(rateKey);
  // نشست‌های منقضی را هنگام ورود موفق پاک می‌کنیم تا جدول رشد نکند.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await createUserSession(user.id);
  return Response.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      role: user.role,
    },
  });
}
