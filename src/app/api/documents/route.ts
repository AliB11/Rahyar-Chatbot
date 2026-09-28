import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { extractTextFromFile, saveDocument } from "@/lib/ingestion";

export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function visibleDocuments(user: { role: string; department: string }) {
  return user.role === "admin"
    ? undefined
    : or(eq(documents.department, "عمومی"), eq(documents.department, user.department));
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای مشاهده پایگاه دانش وارد شوید." }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 120);
  const conditions = [visibleDocuments(user)];
  if (query) conditions.push(or(
    // The search is intentionally scoped to the user's authorized documents.
    ilike(documents.title, `%${query}%`),
    ilike(documents.fileName, `%${query}%`),
  ));
  const where = and(...conditions);
  const [items, [{ total }]] = await Promise.all([
    db.select({
      id: documents.id,
      title: documents.title,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      sourceType: documents.sourceType,
      department: documents.department,
      createdAt: documents.createdAt,
    }).from(documents).where(where).orderBy(desc(documents.createdAt)).limit(100),
    db.select({ total: count() }).from(documents).where(where),
  ]);
  return Response.json({ documents: items, total: Number(total) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "برای بارگذاری وارد شوید." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "فقط مدیر سیستم اجازه افزودن سند دارد." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "فرم بارگذاری معتبر نیست." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "یک فایل معتبر انتخاب کنید." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "حداکثر حجم فایل ۲۰ مگابایت است." }, { status: 413 });

  const department = typeof form.get("department") === "string" ? String(form.get("department")).trim().slice(0, 80) : "عمومی";
  const title = typeof form.get("title") === "string" && String(form.get("title")).trim()
    ? String(form.get("title")).trim().slice(0, 180)
    : file.name.replace(/\.[^.]+$/, "");
  if (!department) return Response.json({ error: "واحد دسترسی سند مشخص نشده است." }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = await extractTextFromFile(file.name, buffer);
    const stored = await saveDocument({
      title,
      fileName: file.name.slice(0, 255),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sourceType: "upload",
      department,
      content,
      uploadedBy: user.id,
    });
    await writeAuditLog(user.id, "document.uploaded", { documentId: stored.id, fileName: file.name, department });
    return Response.json({ document: { id: stored.id, title, fileName: file.name, department }, chunks: stored.chunks }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "استخراج متن فایل انجام نشد.";
    return Response.json({ error: message.slice(0, 260) }, { status: 422 });
  }
}
