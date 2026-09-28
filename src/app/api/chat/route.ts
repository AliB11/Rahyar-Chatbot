import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { conversations, documentChunks, documents, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { embedTexts, generateGroundedAnswer, rankCandidates, toCitation } from "@/lib/rag";
import type { SearchCandidate } from "@/lib/rag";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای مشاهده گفت‌وگو وارد شوید." }, { status: 401 });
  const conversationId = new URL(request.url).searchParams.get("id");
  if (conversationId) {
    if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "شناسه گفت‌وگو معتبر نیست." }, { status: 400 });
    const [conversation] = await db.select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
      .limit(1);
    if (!conversation) return Response.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    const history = await db.select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      citations: messages.citations,
      createdAt: messages.createdAt,
    }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
    if (user.role === "admin") return Response.json({ messages: history });
    const allowedDocuments = await db.select({ id: documents.id }).from(documents)
      .where(or(eq(documents.department, "عمومی"), eq(documents.department, user.department)));
    const allowedIds = new Set(allowedDocuments.map((document) => document.id));
    const safeHistory = history.map((message) => {
      const hasRestrictedSource = message.role === "assistant" && message.citations.some((citation) => !allowedIds.has(citation.documentId));
      return hasRestrictedSource
        ? { ...message, content: "دسترسی به منبع این پاسخ تغییر کرده است؛ برای دریافت پاسخ تازه، پرسش را دوباره مطرح کنید.", citations: [] }
        : message;
    });
    return Response.json({ messages: safeHistory });
  }

  const history = await db.select({
    id: conversations.id,
    title: conversations.title,
    updatedAt: conversations.updatedAt,
  }).from(conversations)
    .where(eq(conversations.userId, user.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(35);
  return Response.json({ conversations: history });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای گفت‌وگو وارد شوید." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "درخواست معتبر نیست." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 2 || question.length > 2000) {
    return Response.json({ error: "پرسش باید بین ۲ تا ۲۰۰۰ نویسه باشد." }, { status: 400 });
  }
  const requestedConversation = typeof body.conversationId === "string" ? body.conversationId : "";
  if (requestedConversation && !UUID_PATTERN.test(requestedConversation)) {
    return Response.json({ error: "شناسه گفت‌وگو معتبر نیست." }, { status: 400 });
  }

  try {
    let conversationId = requestedConversation;
    if (conversationId) {
      const [existing] = await db.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id))).limit(1);
      if (!existing) return Response.json({ error: "گفت‌وگو پیدا نشد." }, { status: 404 });
    } else {
      const [created] = await db.insert(conversations).values({
        userId: user.id,
        title: question.replace(/\s+/g, " ").slice(0, 70),
      }).returning({ id: conversations.id });
      conversationId = created.id;
    }

    const previousQuestions = await db.select({ content: messages.content }).from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
      .orderBy(desc(messages.createdAt))
      .limit(3);
    const recentContext = previousQuestions.reverse().map((item) => item.content.slice(0, 500));
    const retrievalQuery = [...recentContext, question].join("\n");
    await db.insert(messages).values({ conversationId, role: "user", content: question });
    const scope = user.role === "admin"
      ? undefined
      : or(eq(documents.department, "عمومی"), eq(documents.department, user.department));
    const rows = await db.select({
      id: documentChunks.id,
      documentId: documents.id,
      content: documentChunks.content,
      embedding: documentChunks.embedding,
      title: documents.title,
      fileName: documents.fileName,
      department: documents.department,
    }).from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(scope)
      .orderBy(desc(documents.createdAt))
      .limit(1800);

    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = (await embedTexts([retrievalQuery]))[0] ?? null;
    } catch (error) {
      console.warn("Query embedding unavailable; using lexical retrieval.", error);
    }
    const candidates: SearchCandidate[] = rows.map((row) => ({ ...row }));
    const ranked = rankCandidates(candidates, retrievalQuery, queryEmbedding);
    const citations = ranked.map(({ candidate }) => toCitation(candidate));
    const answer = await generateGroundedAnswer(question, citations, recentContext);
    const [saved] = await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: answer,
      citations,
    }).returning({ id: messages.id, createdAt: messages.createdAt });
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

    return Response.json({
      conversationId,
      message: { id: saved.id, role: "assistant", content: answer, citations, createdAt: saved.createdAt },
      retrieval: { strategy: process.env.OPENAI_API_KEY ? "hybrid" : "persian-bm25", chunks: ranked.length },
    });
  } catch (error) {
    console.error("RAG chat request failed", error);
    return Response.json({ error: "پاسخ‌گویی موقتاً با مشکل روبه‌رو شد. دوباره تلاش کنید." }, { status: 500 });
  }
}
