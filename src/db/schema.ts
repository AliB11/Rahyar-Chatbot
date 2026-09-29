import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type UserRole = "admin" | "user";
export type SourceKind = "url" | "api" | "postgres";
export type Citation = {
  documentId: string;
  title: string;
  fileName: string;
  department: string;
  excerpt: string;
};

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    department: text("department").notNull().default("ستاد"),
    role: text("role").$type<UserRole>().notNull().default("user"),
    active: boolean("active").notNull().default(true),
    createdAt: now(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_department_idx").on(table.department)],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expires_idx").on(table.expiresAt)],
);

export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").$type<SourceKind>().notNull(),
    endpoint: text("endpoint").notNull().default(""),
    department: text("department").notNull().default("عمومی"),
    encryptedConfig: text("encrypted_config"),
    active: boolean("active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
  },
  (table) => [index("data_sources_active_idx").on(table.active), index("data_sources_department_idx").on(table.department)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("text/plain"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    sourceType: text("source_type").$type<"upload" | SourceKind>().notNull().default("upload"),
    sourceId: uuid("source_id").references(() => dataSources.id, { onDelete: "set null" }),
    department: text("department").notNull().default("عمومی"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
  },
  (table) => [
    index("documents_department_idx").on(table.department),
    index("documents_created_at_idx").on(table.createdAt),
    uniqueIndex("documents_source_unique").on(table.sourceId),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    embedding: jsonb("embedding").$type<number[]>(),
    createdAt: now(),
  },
  (table) => [index("document_chunks_document_idx").on(table.documentId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("گفت‌وگوی جدید"),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversations_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Citation[]>().notNull().default([]),
    createdAt: now(),
  },
  (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: now(),
  },
  (table) => [index("audit_logs_created_idx").on(table.createdAt), index("audit_logs_actor_idx").on(table.actorId)],
);
