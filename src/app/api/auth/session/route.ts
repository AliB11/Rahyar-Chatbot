import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const [user, [{ total }]] = await Promise.all([
    getCurrentUser(),
    db.select({ total: count() }).from(users),
  ]);
  return Response.json({ user, setupRequired: Number(total) === 0 });
}
