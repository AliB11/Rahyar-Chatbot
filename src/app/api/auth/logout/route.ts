import { clearUserSession } from "@/lib/auth";

export async function POST() {
  await clearUserSession();
  return Response.json({ ok: true });
}
