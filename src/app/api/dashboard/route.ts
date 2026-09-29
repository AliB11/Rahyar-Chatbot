import { and, count, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { conversations, dataSources, documents, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  const documentScope = user.role === "admin"
    ? undefined
    : or(eq(documents.department, "عمومی"), eq(documents.department, user.department));
  const [documentCount, sourceCount, conversationCount, userCount] = await Promise.all([
    db.select({ total: count() }).from(documents).where(documentScope),
    db.select({ total: count() }).from(dataSources).where(user.role === "admin"
      ? eq(dataSources.active, true)
      : and(eq(dataSources.active, true), or(eq(dataSources.department, "عمومی"), eq(dataSources.department, user.department)))), 
    db.select({ total: count() }).from(conversations).where(eq(conversations.userId, user.id)),
    user.role === "admin" ? db.select({ total: count() }).from(users) : Promise.resolve([{ total: 0 }]),
  ]);
  return Response.json({
    stats: {
      documents: Number(documentCount[0].total),
      sources: Number(sourceCount[0].total),
      conversations: Number(conversationCount[0].total),
      users: Number(userCount[0].total),
    },
    ragMode: process.env.OPENAI_API_KEY ? "hybrid" : "lexical",
  });
}
