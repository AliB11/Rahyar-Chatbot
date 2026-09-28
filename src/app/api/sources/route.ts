import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { dataSources, documents, type SourceKind } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { encryptJson } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای مشاهده منابع وارد شوید." }, { status: 401 });
  const results = await db.select({
    id: dataSources.id,
    name: dataSources.name,
    kind: dataSources.kind,
    department: dataSources.department,
    active: dataSources.active,
    lastSyncedAt: dataSources.lastSyncedAt,
    lastError: dataSources.lastError,
    createdAt: dataSources.createdAt,
  }).from(dataSources)
    .where(user.role === "admin" ? undefined : or(eq(dataSources.department, "عمومی"), eq(dataSources.department, user.department)))
    .orderBy(asc(dataSources.name));
  const safeSources = results.map(({ lastError, ...source }) => ({
    ...source,
    ...(user.role === "admin" ? { lastError } : {}),
  }));
  return Response.json({ sources: safeSources });
}

function validHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isReadOnlyQuery(value: string) {
  const query = value.trim().replace(/;+\s*$/, "");
  return /^(select|with)\b/i.test(query) && !query.includes(";") && query.length <= 5000;
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه افزودن منبع دارد." }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const department = typeof body.department === "string" ? body.department.trim().slice(0, 80) : "عمومی";
  const kind = body.kind === "url" || body.kind === "api" || body.kind === "postgres" ? body.kind as SourceKind : null;
  if (!name || !department || !kind) return Response.json({ error: "نام، نوع و دامنه دسترسی منبع را مشخص کنید." }, { status: 400 });

  let endpoint = "";
  let encryptedConfig: string | null = null;
  if (kind === "url" || kind === "api") {
    const remoteEndpoint = typeof body.endpoint === "string" ? body.endpoint.trim().slice(0, 2000) : "";
    if (!validHttpUrl(remoteEndpoint)) return Response.json({ error: "نشانی منبع باید یک URL معتبر HTTP یا HTTPS باشد." }, { status: 400 });
    const bearerToken = kind === "api" && typeof body.bearerToken === "string" ? body.bearerToken.trim() : "";
    if (bearerToken.length > 2000) return Response.json({ error: "توکن بیش از حد طولانی است." }, { status: 400 });
    endpoint = kind === "url" ? "صفحه داخلی" : "REST API داخلی";
    encryptedConfig = encryptJson({ endpoint: remoteEndpoint, ...(bearerToken ? { bearerToken } : {}) });
  } else {
    const connectionString = typeof body.connectionString === "string" ? body.connectionString.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!/^postgres(?:ql)?:\/\//i.test(connectionString) || connectionString.length > 4000) {
      return Response.json({ error: "رشته اتصال PostgreSQL معتبر نیست." }, { status: 400 });
    }
    if (!isReadOnlyQuery(query)) {
      return Response.json({ error: "پرس‌وجو باید یک دستور SELECT یا WITH خواندنی باشد." }, { status: 400 });
    }
    endpoint = "پایگاه داده داخلی";
    encryptedConfig = encryptJson({ connectionString, query });
  }

  try {
    const [source] = await db.insert(dataSources).values({
      name,
      kind,
      endpoint,
      department,
      encryptedConfig,
      createdBy: actor.id,
    }).returning({ id: dataSources.id, name: dataSources.name, kind: dataSources.kind, department: dataSources.department });
    await writeAuditLog(actor.id, "source.created", { sourceId: source.id, name, kind, department });
    return Response.json({ source }, { status: 201 });
  } catch (error) {
    console.error("Data source creation failed", error);
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 200) : "ساخت منبع انجام نشد." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه ویرایش منبع دارد." }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "شناسه منبع لازم است." }, { status: 400 });
  const changes: { active?: boolean; department?: string } = {};
  if (typeof body.active === "boolean") changes.active = body.active;
  if (typeof body.department === "string" && body.department.trim()) changes.department = body.department.trim().slice(0, 80);
  if (!Object.keys(changes).length) return Response.json({ error: "تغییری برای ذخیره ارسال نشده است." }, { status: 400 });
  const source = await db.transaction(async (transaction) => {
    const [updated] = await transaction.update(dataSources).set(changes).where(eq(dataSources.id, id)).returning({
      id: dataSources.id,
      name: dataSources.name,
      active: dataSources.active,
      department: dataSources.department,
    });
    if (updated && changes.department) {
      await transaction.update(documents).set({ department: updated.department }).where(eq(documents.sourceId, id));
    }
    return updated;
  });
  if (!source) return Response.json({ error: "منبع پیدا نشد." }, { status: 404 });
  await writeAuditLog(actor.id, "source.updated", { sourceId: id, active: source.active, department: source.department });
  return Response.json({ source });
}

export async function DELETE(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "برای ادامه وارد شوید." }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه حذف منبع دارد." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "شناسه منبع لازم است." }, { status: 400 });
  const [source] = await db.delete(dataSources).where(eq(dataSources.id, id)).returning({ id: dataSources.id, name: dataSources.name });
  if (!source) return Response.json({ error: "منبع پیدا نشد." }, { status: 404 });
  await writeAuditLog(actor.id, "source.deleted", { sourceId: source.id, name: source.name });
  return Response.json({ ok: true });
}
