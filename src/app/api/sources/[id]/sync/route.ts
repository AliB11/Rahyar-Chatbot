import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { db } from "@/db";
import { dataSources } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { saveDocument } from "@/lib/ingestion";
import { decryptJson } from "@/lib/security";
import { htmlToText } from "@/lib/text";

export const dynamic = "force-dynamic";
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

function ensureReadOnlyQuery(value: string) {
  const query = value.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(query) || query.includes(";") || query.length > 5000) {
    throw new Error("پرس‌وجوی ذخیره‌شده خواندنی نیست.");
  }
  return query;
}

async function readLimitedBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error("حجم پاسخ منبع از ۵ مگابایت بیشتر است.");
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_SOURCE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("حجم پاسخ منبع از ۵ مگابایت بیشتر است.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

async function fetchSourceContent(source: {
  kind: "url" | "api" | "postgres";
  endpoint: string;
  encryptedConfig: string | null;
}) {
  if (source.kind === "postgres") {
    if (!source.encryptedConfig) throw new Error("تنظیمات اتصال پایگاه داده موجود نیست.");
    const config = decryptJson<{ connectionString: string; query: string }>(source.encryptedConfig);
    const query = ensureReadOnlyQuery(config.query);
    const pool = new Pool({
      connectionString: config.connectionString,
      max: 1,
      connectionTimeoutMillis: 7000,
      idleTimeoutMillis: 1000,
      statement_timeout: 12000,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '10000ms'");
      const result = await client.query(`SELECT * FROM (${query}) AS rag_source LIMIT 1000`);
      await client.query("COMMIT");
      return (result.rows as Record<string, unknown>[]).slice(0, 1000)
        .map((row) => JSON.stringify(row, (_key, value: unknown) => value instanceof Date ? value.toISOString() : value))
        .join("\n");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Ignore rollback errors. */ }
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  const config = source.encryptedConfig
    ? decryptJson<{ endpoint?: string; bearerToken?: string }>(source.encryptedConfig)
    : {};
  const remoteEndpoint = config.endpoint || source.endpoint;
  if (!remoteEndpoint) throw new Error("نشانی رمزنگاری‌شدهٔ منبع پیدا نشد.");
  const headers = new Headers({ Accept: "text/html,application/json,text/plain,*/*" });
  if (source.kind === "api" && config.bearerToken) headers.set("Authorization", `Bearer ${config.bearerToken}`);
  const response = await fetch(remoteEndpoint, {
    method: "GET",
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`منبع با کد ${response.status} پاسخ داد.`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_SOURCE_BYTES) throw new Error("حجم پاسخ منبع از ۵ مگابایت بیشتر است.");
  const buffer = await readLimitedBody(response);
  const text = buffer.toString("utf8");
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  }
  return contentType.includes("html") ? htmlToText(text) : text;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه همگام‌سازی دارد." }, { status: 403 });
  const { id } = await params;
  const [source] = await db.select().from(dataSources).where(and(eq(dataSources.id, id), eq(dataSources.active, true))).limit(1);
  if (!source) return Response.json({ error: "منبع فعال پیدا نشد." }, { status: 404 });

  try {
    const content = (await fetchSourceContent(source)).slice(0, 1_500_000);
    if (content.trim().length < 20) throw new Error("متن قابل استفاده‌ای از منبع دریافت نشد.");
    const saved = await saveDocument({
      title: source.name,
      fileName: `${source.name} · همگام‌سازی`,
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      sourceType: source.kind,
      sourceId: source.id,
      department: source.department,
      content,
      uploadedBy: actor.id,
      metadata: { sourceKind: source.kind },
    });
    const syncedAt = new Date();
    await db.update(dataSources).set({ lastSyncedAt: syncedAt, lastError: null }).where(eq(dataSources.id, source.id));
    await writeAuditLog(actor.id, "source.synced", { sourceId: source.id, name: source.name, chunks: saved.chunks });
    return Response.json({ ok: true, documentId: saved.id, chunks: saved.chunks, syncedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "همگام‌سازی منبع انجام نشد.";
    await db.update(dataSources).set({ lastError: message.slice(0, 220) }).where(eq(dataSources.id, source.id));
    console.error("Internal source sync failed", error);
    return Response.json({ error: message.slice(0, 220) }, { status: 422 });
  }
}
