import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { db } from "@/db";
import { documentChunks, documents, type SourceKind } from "@/db/schema";
import { chunkText, htmlToText, tokenize } from "@/lib/text";
import { embedTexts } from "@/lib/rag";

const MAX_EXTRACTED_CHARACTERS = 1_500_000;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.map((values) => values.join(" | ")).join("\n");
}

export async function extractTextFromFile(fileName: string, buffer: Buffer) {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
  let text: string;

  if (["txt", "md", "markdown", "csv", "json", "html", "htm", "xml", "yaml", "yml", "log", "ini", "sql", "tsv"].includes(extension)) {
    text = buffer.toString("utf8");
    if (extension === "csv" || extension === "tsv") text = parseCsv(text.replace(/\t/g, extension === "tsv" ? "," : "\t"));
    else if (extension === "json") {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Keep valid UTF-8 text even when a JSON export is incomplete.
      }
    } else if (["html", "htm"].includes(extension)) text = htmlToText(text);
    else if (extension === "xml") text = htmlToText(text.replace(/<\/?[\w:.-]+(?:\s[^>]*)?>/g, " "));
  } else if (extension === "pdf") {
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (["xlsx", "xlsm"].includes(extension)) {
    const workbook = new ExcelJS.Workbook();
    const excelBuffer = Uint8Array.from(buffer).buffer;
    await workbook.xlsx.load(excelBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    text = workbook.worksheets.map((sheet) => {
      const rows: string[] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => cells.push(cell.text.trim()));
        if (cells.some(Boolean)) rows.push(cells.join(" | "));
      });
      return `برگه: ${sheet.name}\n${rows.join("\n")}`;
    }).join("\n\n");
  } else {
    throw new Error("فرمت پشتیبانی نمی‌شود. PDF، Word، Excel، CSV، JSON، HTML و فایل‌های متنی مجاز هستند.");
  }

  const cleaned = text.replace(/\u0000/g, " ").replace(/\r\n?/g, "\n").trim();
  if (cleaned.length < 20) throw new Error("متن قابل استفاده‌ای از این فایل استخراج نشد.");
  return cleaned.slice(0, MAX_EXTRACTED_CHARACTERS);
}

type SaveDocumentInput = {
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceType: "upload" | SourceKind;
  sourceId?: string | null;
  department: string;
  content: string;
  uploadedBy?: string | null;
  metadata?: Record<string, string>;
};

export async function saveDocument(input: SaveDocumentInput) {
  const pieces = chunkText(input.content);
  if (!pieces.length) throw new Error("محتوای سند خالی است.");

  const vectors: (number[] | null)[] = pieces.map(() => null);
  for (let start = 0; start < pieces.length; start += 32) {
    const batch = pieces.slice(start, start + 32);
    try {
      const embedded = await embedTexts(batch);
      embedded.forEach((vector, index) => {
        vectors[start + index] = vector;
      });
    } catch (error) {
      console.warn("Embedding unavailable; using Persian lexical retrieval instead.", error);
      break;
    }
  }

  return db.transaction(async (transaction) => {
    let documentId: string;
    if (input.sourceId) {
      const existing = await transaction
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.sourceId, input.sourceId))
        .limit(1);
      if (existing[0]) {
        documentId = existing[0].id;
        await transaction
          .update(documents)
          .set({
            title: input.title,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            sourceType: input.sourceType,
            department: input.department,
            content: input.content,
            metadata: input.metadata ?? {},
            uploadedBy: input.uploadedBy ?? null,
          })
          .where(eq(documents.id, documentId));
        await transaction.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
      } else {
        const inserted = await transaction.insert(documents).values({
          title: input.title,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          department: input.department,
          content: input.content,
          metadata: input.metadata ?? {},
          uploadedBy: input.uploadedBy ?? null,
        }).returning({ id: documents.id });
        documentId = inserted[0].id;
      }
    } else {
      const inserted = await transaction.insert(documents).values({
        title: input.title,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sourceType: input.sourceType,
        department: input.department,
        content: input.content,
        metadata: input.metadata ?? {},
        uploadedBy: input.uploadedBy ?? null,
      }).returning({ id: documents.id });
      documentId = inserted[0].id;
    }

    for (let start = 0; start < pieces.length; start += 100) {
      const batch = pieces.slice(start, start + 100);
      await transaction.insert(documentChunks).values(batch.map((content, offset) => ({
        documentId,
        chunkIndex: start + offset,
        content,
        tokenCount: tokenize(content).length,
        embedding: vectors[start + offset],
      })));
    }
    return { id: documentId, chunks: pieces.length };
  });
}
