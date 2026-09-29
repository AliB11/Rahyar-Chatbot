"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";

type Account = {
  id: string;
  fullName: string;
  email: string;
  department: string;
  role: "admin" | "user";
};

type Citation = {
  documentId: string;
  title: string;
  fileName: string;
  department: string;
  excerpt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
};

type Conversation = { id: string; title: string; updatedAt: string };
type KnowledgeDocument = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceType: string;
  department: string;
  createdAt: string;
};
type DataSource = {
  id: string;
  name: string;
  kind: "url" | "api" | "postgres";
  department: string;
  active: boolean;
  lastSyncedAt: string | null;
  lastError?: string | null;
  createdAt: string;
};
type ManagedUser = Account & { active: boolean; createdAt?: string };
type WorkspaceStats = { documents: number; sources: number; conversations: number; users: number };
type NavPage = "chat" | "knowledge" | "sources" | "users";
type IconName =
  | "sparkles" | "chat" | "book" | "database" | "users" | "plus" | "search" | "menu"
  | "send" | "paperclip" | "shield" | "logout" | "arrow" | "close" | "file" | "globe"
  | "code" | "server" | "sync" | "trash" | "clock" | "check" | "lock" | "mail"
  | "user" | "building" | "chevron" | "upload" | "alert" | "chart" | "key" | "spark" | "copy";

const departments = ["عمومی", "ستاد", "فناوری اطلاعات", "اعتبارات", "شعب", "خزانه‌داری", "مدیریت ریسک", "تطبیق و مبارزه با پولشویی"];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "درخواست انجام نشد. دوباره تلاش کنید.");
  return payload;
}

function postJson(url: string, body: unknown) {
  return requestJson<{ [key: string]: unknown }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function Icon({ name, size = 19, className = "" }: { name: IconName; size?: number; className?: string }) {
  const shapes: Record<IconName, ReactNode> = {
    sparkles: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="m5 2 .7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7L5 2Z"/></>,
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8M8 10h7"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
    paperclip: <><path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></>,
    code: <><path d="m16 18 6-6-6-6M8 6l-6 6 6 6M14 4l-4 16"/></>,
    server: <><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></>,
    sync: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6M10 11v5M14 11v5"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4M12 15v3"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    building: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></>,
    chevron: <><path d="m9 18 6-6-6-6"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
    alert: <><path d="M10.3 3.9 1.9 18.1A2 2 0 0 0 3.6 21h16.8a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/></>,
    chart: <><path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/></>,
    key: <><circle cx="8" cy="15" r="5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L21 8"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  };
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "هنوز همگام‌سازی نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "ر";
}

let localIdSequence = 0;
function localMessageId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  localIdSequence += 1;
  return `${prefix}-${localIdSequence}`;
}

function MessageText({ text }: { text: string }) {
  return <div className="message-copy">{text.split("\n").map((line, lineIndex) => {
    if (!line.trim()) return <div className="message-gap" key={`gap-${lineIndex}`} />;
    const parts = line.split(/(\*\*.*?\*\*|\[\d+\])/g);
    return <p key={`line-${lineIndex}`}>{parts.map((part, partIndex) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
      if (/^\[\d+\]$/.test(part)) return <span className="inline-citation" key={partIndex}>{part.slice(1, -1)}</span>;
      return <span key={partIndex}>{part}</span>;
    })}</p>;
  })}</div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export default function AssistantDashboard() {
  const [user, setUser] = useState<Account | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "setup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({ fullName: "", email: "", password: "", department: "ستاد" });
  const [page, setPage] = useState<NavPage>("chat");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [stats, setStats] = useState<WorkspaceStats>({ documents: 0, sources: 0, conversations: 0, users: 0 });
  const [ragMode, setRagMode] = useState<"hybrid" | "lexical">("lexical");
  const [lastStrategy, setLastStrategy] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadDepartment, setUploadDepartment] = useState("عمومی");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [documentSearch, setDocumentSearch] = useState("");
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceKind, setSourceKind] = useState<"url" | "api" | "postgres">("url");
  const [sourceForm, setSourceForm] = useState({ name: "", endpoint: "", bearerToken: "", connectionString: "", query: "SELECT * FROM public.documents LIMIT 1000", department: "عمومی" });
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: "", email: "", password: "", department: "شعب", role: "user" as "user" | "admin" });
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshWorkspace = useCallback(async (account: Account) => {
    try {
      const [dashboard, knowledge, sourceData, chatData] = await Promise.all([
        requestJson<{ stats: WorkspaceStats; ragMode: "hybrid" | "lexical" }>("/api/dashboard"),
        requestJson<{ documents: KnowledgeDocument[] }>("/api/documents"),
        requestJson<{ sources: DataSource[] }>("/api/sources"),
        requestJson<{ conversations: Conversation[] }>("/api/chat"),
      ]);
      setStats(dashboard.stats);
      if (dashboard.ragMode) setRagMode(dashboard.ragMode);
      setDocuments(knowledge.documents);
      setSources(sourceData.sources);
      setConversations(chatData.conversations);
      if (account.role === "admin") {
        const usersData = await requestJson<{ users: ManagedUser[] }>("/api/users");
        setManagedUsers(usersData.users);
      } else {
        setManagedUsers([]);
      }
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "بارگذاری اطلاعات ناموفق بود.", kind: "error" });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await requestJson<{ user: Account | null; setupRequired: boolean }>("/api/auth/session");
        if (!mounted) return;
        setSetupRequired(session.setupRequired);
        setAuthMode(session.setupRequired ? "setup" : "login");
        if (session.user) {
          setUser(session.user);
          await refreshWorkspace(session.user);
        }
      } catch {
        if (mounted) setAuthError("ارتباط با سامانه برقرار نشد. صفحه را دوباره بارگذاری کنید.");
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refreshWorkspace]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  // میان‌بر «گفت‌وگوی جدید»: ⌘K / Ctrl+K (همان نشانگری که در کنار دکمه نمایش داده می‌شود)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setConversationId(null);
        setMessages([]);
        setDraft("");
        setPage("chat");
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // رشد خودکار کادر پرسش متناسب با متن تایپشده
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 125)}px`;
  }, [draft]);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
  }, []);

  const notify = (message: string, kind: "success" | "error" = "success") => {
    setToast({ message, kind });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 4200);
  };

  const setPageAndClose = (nextPage: NavPage) => {
    setPage(nextPage);
    setMobileNavOpen(false);
  };

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const path = authMode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const data = await postJson(path, authMode === "setup" ? authForm : { email: authForm.email, password: authForm.password }) as { user: Account };
      setUser(data.user);
      setSetupRequired(false);
      setPage("chat");
      await refreshWorkspace(data.user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "ورود انجام نشد.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* The local session is cleared either way. */ }
    setUser(null);
    setMessages([]);
    setConversations([]);
    setConversationId(null);
    setAuthMode("login");
  }

  async function loadConversation(id: string) {
    setPageAndClose("chat");
    setConversationId(id);
    setMessages([]);
    try {
      const data = await requestJson<{ messages: ChatMessage[] }>(`/api/chat?id=${encodeURIComponent(id)}`);
      setMessages(data.messages);
    } catch (error) {
      notify(error instanceof Error ? error.message : "گفت‌وگو بارگذاری نشد.", "error");
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setPageAndClose("chat");
  }

  async function sendQuestion(value = draft) {
    const question = value.trim();
    if (!question || sending || !user) return;
    // فقط وقتی خودِ پیش‌نویس ارسال می‌شود آن را پاک کن؛ پیشنهادهای آماده نباید متن در حال نوشتن کاربر را از بین ببرند.
    if (value === draft) setDraft("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: localMessageId("local"),
      role: "user",
      content: question,
      citations: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const data = await postJson("/api/chat", { question, conversationId }) as {
        conversationId: string;
        message: ChatMessage;
        retrieval?: { strategy?: string };
      };
      setConversationId(data.conversationId);
      setMessages((current) => [...current, data.message]);
      if (data.retrieval?.strategy) setLastStrategy(data.retrieval.strategy);
      const chatData = await requestJson<{ conversations: Conversation[] }>("/api/chat");
      setConversations(chatData.conversations);
      setStats((current) => ({ ...current, conversations: Math.max(current.conversations, chatData.conversations.length) }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "پاسخ‌گویی انجام نشد.";
      notify(errorMessage, "error");
      setMessages((current) => [...current, {
        id: localMessageId("error"),
        role: "assistant",
        content: "در پاسخ‌گویی مشکلی پیش آمد. اتصال را بررسی کنید و دوباره تلاش کنید.",
        citations: [],
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  }

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion();
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopiedMessageId((current) => (current === message.id ? null : current)), 1800);
    } catch {
      notify("کپی متن پاسخ ممکن نشد.", "error");
    }
  }

  async function uploadDocument() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    const formData = new FormData();
    formData.set("file", selectedFile);
    formData.set("department", uploadDepartment);
    try {
      const result = await requestJson<{ document: { title: string }; chunks: number }>("/api/documents", { method: "POST", body: formData });
      notify(`«${result.document.title}» با ${result.chunks.toLocaleString("fa-IR")} قطعه به پایگاه دانش افزوده شد.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "بارگذاری فایل انجام نشد.", "error");
    } finally {
      setUploading(false);
    }
  }

  function onFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  }

  async function deleteDocument(document: KnowledgeDocument) {
    if (!user) return;
    try {
      await requestJson(`/api/documents/${document.id}`, { method: "DELETE" });
      notify(`سند «${document.title}» حذف شد.`);
      await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "حذف سند ناموفق بود.", "error");
    }
  }

  async function addDataSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSourceBusy(true);
    const body: Record<string, string> = { name: sourceForm.name, kind: sourceKind, department: sourceForm.department };
    if (sourceKind === "postgres") {
      body.connectionString = sourceForm.connectionString;
      body.query = sourceForm.query;
    } else {
      body.endpoint = sourceForm.endpoint;
      if (sourceKind === "api") body.bearerToken = sourceForm.bearerToken;
    }
    try {
      await postJson("/api/sources", body);
      notify("منبع داخلی ثبت شد؛ اکنون آن را همگام‌سازی کنید.");
      setSourceForm({ name: "", endpoint: "", bearerToken: "", connectionString: "", query: "SELECT * FROM public.documents LIMIT 1000", department: "عمومی" });
      setSourceFormOpen(false);
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "ثبت منبع انجام نشد.", "error");
    } finally {
      setSourceBusy(false);
    }
  }

  async function syncDataSource(source: DataSource) {
    if (busyIds.includes(source.id)) return;
    setBusyIds((current) => [...current, source.id]);
    try {
      const result = await requestJson<{ chunks: number }>(`/api/sources/${source.id}/sync`, { method: "POST" });
      notify(`«${source.name}» همگام شد و ${result.chunks.toLocaleString("fa-IR")} قطعه به RAG رسید.`);
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "همگام‌سازی انجام نشد.", "error");
      if (user) await refreshWorkspace(user);
    } finally {
      setBusyIds((current) => current.filter((id) => id !== source.id));
    }
  }

  async function toggleDataSource(source: DataSource) {
    try {
      await requestJson("/api/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, active: !source.active }),
      });
      notify(source.active ? "منبع غیرفعال شد." : "منبع فعال شد.");
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "تغییر وضعیت منبع انجام نشد.", "error");
    }
  }

  async function deleteDataSource(source: DataSource) {
    try {
      await requestJson(`/api/sources?id=${encodeURIComponent(source.id)}`, { method: "DELETE" });
      notify(`اتصال «${source.name}» حذف شد.`);
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "حذف منبع انجام نشد.", "error");
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserBusy(true);
    try {
      await postJson("/api/users", userForm);
      notify("حساب کاربری جدید ساخته شد.");
      setUserForm({ fullName: "", email: "", password: "", department: "شعب", role: "user" });
      setUserFormOpen(false);
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "ساخت حساب انجام نشد.", "error");
    } finally {
      setUserBusy(false);
    }
  }

  async function updateManagedUser(target: ManagedUser, changes: { active?: boolean; role?: "admin" | "user" }) {
    try {
      await requestJson(`/api/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      notify("تغییرات دسترسی ذخیره شد.");
      if (user) await refreshWorkspace(user);
    } catch (error) {
      notify(error instanceof Error ? error.message : "به‌روزرسانی حساب انجام نشد.", "error");
    }
  }

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLocaleLowerCase("fa-IR");
    if (!query) return documents;
    return documents.filter((document) => `${document.title} ${document.fileName} ${document.department}`.toLocaleLowerCase("fa-IR").includes(query));
  }, [documents, documentSearch]);

  const activeTitle: Record<NavPage, { eyebrow: string; title: string; description: string }> = {
    chat: { eyebrow: "مرکز هوشمند بانکی", title: "دستیار دانشی شما", description: "پاسخ‌های مستند، محرمانه و متناسب با واحد سازمانی شما." },
    knowledge: { eyebrow: "مخزن امن اسناد", title: "پایگاه دانش", description: "مستندات مصوب و منابعی که دستیار بر اساس آن‌ها پاسخ می‌دهد." },
    sources: { eyebrow: "یکپارچه‌سازی سازمانی", title: "منابع داده", description: "اتصال امن به وب‌سرویس‌ها، صفحات داخلی و پایگاه‌های داده سازمان." },
    users: { eyebrow: "مدیریت دسترسی", title: "کاربران و واحدها", description: "مدیریت نقش‌ها و دامنه دسترسی به دانش بانکی." },
  };

  if (authLoading) {
    return <main className="auth-loading" dir="rtl"><div className="loading-orb"><Icon name="sparkles" size={25}/></div><p>در حال آماده‌سازی فضای امن...</p></main>;
  }

  if (!user) {
    const isSetup = setupRequired || authMode === "setup";
    return (
      <main className="auth-shell" dir="rtl">
        <section className="auth-art">
          <div className="auth-art-glow auth-art-glow-one"/><div className="auth-art-glow auth-art-glow-two"/>
          <div className="auth-brand"><span className="brand-mark"><Icon name="sparkles" size={23}/></span><span><strong>راهیار</strong><small>دستیار هوشمند بانکی</small></span></div>
          <div className="auth-art-content">
            <span className="secure-pill"><Icon name="shield" size={15}/> همراه امن دانش سازمانی</span>
            <h1>دانش بانک،<br/><span>همیشه در دسترس.</span></h1>
            <p>از آیین‌نامه‌ها تا پاسخ‌های روزمره؛ اطلاعات معتبر را در گفت‌وگویی روان و فارسی پیدا کنید.</p>
            <div className="auth-feature-list">
              <div><span><Icon name="check" size={16}/></span> پاسخ مستند با ارجاع به منبع</div>
              <div><span><Icon name="check" size={16}/></span> دسترسی تفکیک‌شده بر اساس واحد</div>
              <div><span><Icon name="check" size={16}/></span> میزبانی و مدیریت درون‌سازمانی</div>
            </div>
          </div>
          <div className="auth-art-foot"><span><Icon name="lock" size={14}/> ارتباط رمزنگاری‌شده</span><span>نسخه سازمانی · ۱۴۰۵</span></div>
          <div className="auth-floating-card"><span className="floating-spark"><Icon name="spark" size={18}/></span><div><strong>پاسخ از منبع معتبر</strong><small>ارجاع دقیق · دسترسی کنترل‌شده</small></div><span className="floating-check"><Icon name="check" size={14}/></span></div>
        </section>
        <section className="auth-panel">
          <div className="mobile-auth-brand"><span className="brand-mark"><Icon name="sparkles" size={21}/></span><strong>راهیار</strong></div>
          <div className="auth-form-wrap">
            <div className="auth-kicker"><span className="auth-kicker-dot"/>{isSetup ? "راه‌اندازی اولیه" : "خوش آمدید"}</div>
            <h2>{isSetup ? "ساخت مدیر سیستم" : "به فضای کاری وارد شوید"}</h2>
            <p className="auth-form-subtitle">{isSetup ? "حساب مدیر اولیه را بسازید تا مدیریت کاربران و دانش بانک را آغاز کنید." : "با حساب سازمانی خود وارد دستیار امن بانک شوید."}</p>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {isSetup && <label className="field-label">نام و نام خانوادگی<div className="input-wrap"><Icon name="user" size={18}/><input autoComplete="name" required value={authForm.fullName} onChange={(event) => setAuthForm((form) => ({ ...form, fullName: event.target.value }))} placeholder="مثلاً نرگس محمدی"/></div></label>}
              <label className="field-label">ایمیل سازمانی<div className="input-wrap"><Icon name="mail" size={18}/><input autoComplete="username" type="email" required value={authForm.email} onChange={(event) => setAuthForm((form) => ({ ...form, email: event.target.value }))} placeholder="name@bank.ir" dir="ltr"/></div></label>
              {isSetup && <label className="field-label">واحد سازمانی<div className="input-wrap"><Icon name="building" size={18}/><select value={authForm.department} onChange={(event) => setAuthForm((form) => ({ ...form, department: event.target.value }))}>{departments.filter((department) => department !== "عمومی").map((department) => <option key={department}>{department}</option>)}</select><Icon name="chevron" size={15} className="select-chevron"/></div></label>}
              <label className="field-label">گذرواژه<div className="input-wrap"><Icon name="lock" size={18}/><input autoComplete={isSetup ? "new-password" : "current-password"} type="password" required minLength={isSetup ? 10 : 1} value={authForm.password} onChange={(event) => setAuthForm((form) => ({ ...form, password: event.target.value }))} placeholder={isSetup ? "حداقل ۱۰ نویسه" : "گذرواژه حساب سازمانی"} dir="ltr"/></div>{isSetup && <span className="field-hint">برای امنیت حساب، حداقل ۱۰ نویسه وارد کنید.</span>}</label>
              {authError && <div className="form-error"><Icon name="alert" size={17}/>{authError}</div>}
              <button className="primary-button auth-submit" disabled={authBusy} type="submit">{authBusy ? <><span className="spinner"/> در حال بررسی...</> : <>{isSetup ? "ساخت حساب مدیر" : "ورود امن به سامانه"}<Icon name="arrow" size={17}/></>}</button>
            </form>
            <div className="auth-security-note"><span><Icon name="shield" size={16}/></span><div><strong>ورود امن سازمانی</strong><small>نشست شما به‌صورت امن و محرمانه نگهداری می‌شود.</small></div></div>
            {setupRequired && authMode !== "setup" && <button className="setup-link" onClick={() => setAuthMode("setup")} type="button">راه‌اندازی اولین مدیر سیستم</button>}
          </div>
          <div className="auth-panel-foot">استفاده از این سامانه تابع سیاست‌های امنیت اطلاعات سازمان است.</div>
        </section>
      </main>
    );
  }

  const currentPage = activeTitle[page];
  const promptSuggestions = [
    { icon: "book" as const, title: "آیین‌نامه مرتبط را پیدا کن", prompt: "آخرین آیین‌نامه‌های مرتبط با واحد من کدام‌اند؟" },
    { icon: "chart" as const, title: "شرایط یک خدمت بانکی", prompt: "شرایط و مدارک موردنیاز برای خدمات بانکی را از اسناد داخلی توضیح بده." },
    { icon: "shield" as const, title: "رویه‌های کنترلی", prompt: "مهم‌ترین نکات کنترلی و انطباقی ثبت‌شده در اسناد چیست؟" },
  ];

  return (
    <main className="app-shell" dir="rtl">
      {mobileNavOpen && <button className="mobile-overlay" aria-label="بستن منو" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-mark"><Icon name="sparkles" size={21}/></div><div><strong>راهیار</strong><small>دانش هوشمند بانک</small></div><span className="version-chip">PRO</span></div>
        <button className="new-chat-button" onClick={startNewConversation}><Icon name="plus" size={18}/><span>گفت‌وگوی جدید</span><kbd>⌘ K</kbd></button>
        <div className="nav-label">فضای کاری</div>
        <nav className="main-nav" aria-label="ناوبری اصلی">
          <button className={`nav-item ${page === "chat" ? "active" : ""}`} onClick={() => setPageAndClose("chat")}><Icon name="chat"/><span>گفت‌وگوی هوشمند</span><span className="nav-live-dot"/></button>
          <button className={`nav-item ${page === "knowledge" ? "active" : ""}`} onClick={() => setPageAndClose("knowledge")}><Icon name="book"/><span>پایگاه دانش</span><span className="nav-count">{stats.documents.toLocaleString("fa-IR")}</span></button>
          <button className={`nav-item ${page === "sources" ? "active" : ""}`} onClick={() => setPageAndClose("sources")}><Icon name="database"/><span>منابع داده</span></button>
          {user.role === "admin" && <button className={`nav-item ${page === "users" ? "active" : ""}`} onClick={() => setPageAndClose("users")}><Icon name="users"/><span>کاربران و دسترسی</span></button>}
        </nav>
        <div className="sidebar-divider"/>
        <div className="history-heading"><span>گفت‌وگوهای اخیر</span><button type="button" title="گفت‌وگوی جدید" onClick={startNewConversation}><Icon name="plus" size={16}/></button></div>
        <div className="conversation-list">
          {conversations.length === 0 ? <div className="empty-history">گفت‌وگوی ذخیره‌شده‌ای ندارید.</div> : conversations.slice(0, 10).map((item) => <button key={item.id} className={`history-item ${conversationId === item.id && page === "chat" ? "history-active" : ""}`} onClick={() => void loadConversation(item.id)}><Icon name="chat" size={15}/><span>{item.title}</span></button>)}
        </div>
        <div className="sidebar-spacer"/>
        <div className="sidebar-security"><span className="security-icon"><Icon name="shield" size={17}/></span><div><strong>فضای محرمانه</strong><small>دسترسی متناسب با واحد شما</small></div><span className="online-dot"/></div>
        <div className="sidebar-profile"><div className="avatar">{initials(user.fullName)}</div><div className="profile-info"><strong>{user.fullName}</strong><small>{user.role === "admin" ? "مدیر سامانه" : user.department}</small></div><button type="button" className="logout-button" title="خروج از حساب" onClick={() => void handleLogout()}><Icon name="logout" size={18}/></button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-start"><button className="mobile-menu-button" type="button" aria-label="بازکردن منو" onClick={() => setMobileNavOpen(true)}><Icon name="menu"/></button><div className="breadcrumb"><span>راهیار</span><Icon name="chevron" size={14}/><strong>{page === "chat" ? "دستیار هوشمند" : currentPage.title}</strong></div></div>
          <div className="topbar-end"><div className="secure-status"><span className="status-pulse"/><span>محیط امن بانک</span></div><div className="topbar-divider"/><div className="topbar-user"><div className="topbar-avatar">{initials(user.fullName)}</div><div><strong>{user.fullName}</strong><small>{user.department}</small></div></div></div>
        </header>

        <div className={`page-content ${page === "chat" ? "chat-page-content" : ""}`}>
          {page === "chat" && <>
            <div className="chat-heading"><div><div className="eyebrow"><span className="heading-dot"/>{currentPage.eyebrow}</div><h1>{currentPage.title}<span className="title-spark"><Icon name="spark" size={21}/></span></h1><p>{currentPage.description}</p></div><div className="chat-heading-badge"><Icon name="lock" size={16}/><span>داده‌های شما محرمانه است</span>{lastStrategy && <><span className="badge-separator"/><span className="strategy-label">{lastStrategy === "hybrid" ? "بازیابی ترکیبی" : "بازیابی واژگانی فارسی"}</span></>}</div></div>
            <section className={`chat-stage ${messages.length ? "chat-stage-has-messages" : ""}`}>
              <div className="messages-scroll">
                {messages.length === 0 ? <div className="welcome-state">
                  <div className="welcome-orb"><div className="welcome-orb-inner"><Icon name="sparkles" size={28}/></div><span className="orb-ring ring-one"/><span className="orb-ring ring-two"/></div>
                  <div className="welcome-overline">دستیار هوشمند دانش سازمانی</div>
                  <h2>سلام {user.fullName.split(" ")[0]}،<br/><span>چطور می‌توانم کمک کنم؟</span></h2>
                  <p>از دستورالعمل‌ها و اسناد داخلی بپرسید؛ پاسخ‌ها با ارجاع به منبع در دسترس شما ارائه می‌شوند.</p>
                  <div className="suggestion-grid">{promptSuggestions.map((suggestion) => <button key={suggestion.title} className="suggestion-card" onClick={() => void sendQuestion(suggestion.prompt)}><span className="suggestion-icon"><Icon name={suggestion.icon} size={18}/></span><span><strong>{suggestion.title}</strong><small>برای شروع گفتگو کلیک کنید</small></span><Icon name="arrow" size={15} className="suggestion-arrow"/></button>)}</div>
                  {stats.documents === 0 && <div className="empty-knowledge-notice"><Icon name="book" size={16}/> هنوز سندی در دسترس نیست؛ از مدیر سامانه بخواهید پایگاه دانش را تکمیل کند.</div>}
                </div> : <div className="message-list">{messages.map((message) => <article className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`} key={message.id}>
                  {message.role === "assistant" ? <div className="assistant-avatar"><Icon name="sparkles" size={17}/></div> : <div className="user-message-avatar">{initials(user.fullName)}</div>}
                  <div className="message-main"><div className="message-meta"><strong>{message.role === "user" ? "شما" : "دستیار راهیار"}</strong><span>{formatDate(message.createdAt)}</span>{message.role === "assistant" && <button type="button" className={`copy-message-button ${copiedMessageId === message.id ? "copied" : ""}`} onClick={() => void copyMessage(message)}><Icon name={copiedMessageId === message.id ? "check" : "copy"} size={12}/>{copiedMessageId === message.id ? "کپی شد" : "کپی پاسخ"}</button>}</div><div className={`message-bubble ${message.role === "user" ? "user-bubble" : "assistant-bubble"}`}><MessageText text={message.content}/></div>
                    {message.role === "assistant" && message.citations?.length > 0 && <div className="citation-section"><div className="citation-label"><Icon name="book" size={14}/> منابع استفاده‌شده <span>{message.citations.length.toLocaleString("fa-IR")}</span></div><div className="citation-list">{message.citations.map((citation, index) => <details key={`${message.id}-${citation.documentId}-${index}`} className="citation-card"><summary><span className="citation-number">{(index + 1).toLocaleString("fa-IR")}</span><span className="citation-title">{citation.title}</span><span className="citation-department">{citation.department}</span><Icon name="chevron" size={14} className="citation-chevron"/></summary><p>{citation.excerpt}</p><small><Icon name="file" size={13}/>{citation.fileName}</small></details>)}</div></div>}
                  </div>
                </article>)}{sending && <div className="message-row message-assistant"><div className="assistant-avatar"><Icon name="sparkles" size={17}/></div><div className="message-main"><div className="message-meta"><strong>دستیار راهیار</strong><span>در حال جست‌وجو در منابع...</span></div><div className="typing-indicator"><i/><i/><i/><span>بازیابی و آماده‌سازی پاسخ مستند</span></div></div></div>}<div ref={messageEndRef}/></div>}
              </div>
              <div className="composer-wrap"><form className="composer" onSubmit={submitChat}><textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} placeholder="پرسش خود را درباره اسناد و رویه‌های بانکی بنویسید..." rows={1} aria-label="متن پرسش"/><div className="composer-bottom"><div className="composer-hint"><Icon name="shield" size={14}/><span>پاسخ فقط بر اساس اسناد مجاز واحد شما</span><span className="composer-separator">·</span><span>Enter برای ارسال</span></div><button className="send-button" type="submit" disabled={!draft.trim() || sending} aria-label="ارسال پرسش">{sending ? <span className="spinner spinner-white"/> : <><span>ارسال</span><Icon name="send" size={16}/></>}</button></div></form><div className="composer-disclaimer">پاسخ هوش مصنوعی ممکن است نیاز به بررسی سند اصلی داشته باشد.</div></div>
            </section>
          </>}

          {page === "knowledge" && <>
            <PageTitle eyebrow={currentPage.eyebrow} title={currentPage.title} description={currentPage.description} action={<span className="page-count-chip"><Icon name="file" size={15}/>{stats.documents.toLocaleString("fa-IR")} سند فعال</span>}/>
            <div className="stats-grid"><div className="metric-card"><span className="metric-icon metric-green"><Icon name="book"/></span><div><small>سندهای در دسترس</small><strong>{stats.documents.toLocaleString("fa-IR")}</strong></div><span className="metric-note">متناسب با واحد شما</span></div><div className="metric-card"><span className="metric-icon metric-blue"><Icon name="database"/></span><div><small>منابع متصل</small><strong>{stats.sources.toLocaleString("fa-IR")}</strong></div><span className="metric-note">اتصال سازمانی</span></div><div className="metric-card"><span className="metric-icon metric-violet"><Icon name="sparkles"/></span><div><small>بازیابی فارسی</small><strong>{ragMode === "hybrid" ? "ترکیبی" : "واژگانی"}</strong></div><span className="metric-note">قطعه‌بندی آگاه از متن</span></div></div>
            {user.role === "admin" ? <section className="panel upload-panel"><div className="panel-heading"><div><h2><span className="panel-heading-icon"><Icon name="upload" size={18}/></span>افزودن سند به پایگاه دانش</h2><p>فایل پس از استخراج متن، برای بازیابی و پاسخ‌گویی فارسی قطعه‌بندی می‌شود.</p></div><span className="admin-only-chip"><Icon name="shield" size={14}/> فقط مدیر</span></div><div className={`drop-zone ${dragging ? "drop-zone-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onFileDrop}><input ref={fileInputRef} className="visually-hidden" type="file" accept=".pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.json,.txt,.md,.markdown,.html,.htm,.xml,.yaml,.yml,.log,.ini,.sql" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}/><div className="upload-cloud"><Icon name="upload" size={22}/></div><div className="drop-zone-copy"><strong>{selectedFile ? selectedFile.name : "فایل را اینجا رها کنید یا انتخاب کنید"}</strong><span>{selectedFile ? `${formatSize(selectedFile.size)} · آماده بارگذاری` : "PDF، Word، Excel، CSV، JSON، HTML و متن · حداکثر ۲۰ مگابایت"}</span></div><button type="button" className="outline-button" onClick={() => fileInputRef.current?.click()}>{selectedFile ? "تغییر فایل" : "انتخاب فایل"}</button></div><div className="upload-footer"><label className="inline-field"><span>دامنه دسترسی</span><select value={uploadDepartment} onChange={(event) => setUploadDepartment(event.target.value)}>{departments.map((department) => <option key={department}>{department}</option>)}</select><Icon name="chevron" size={14}/></label><div className="upload-actions"><span className="upload-note"><Icon name="lock" size={14}/> فایل خام ذخیره نمی‌شود؛ متن ایندکس می‌شود.</span><button type="button" className="primary-button" disabled={!selectedFile || uploading} onClick={() => void uploadDocument()}>{uploading ? <><span className="spinner spinner-white"/> در حال پردازش...</> : <><Icon name="upload" size={17}/> بارگذاری و ایندکس</>}</button></div></div></section> : <div className="notice-banner"><Icon name="lock" size={17}/><span>افزودن و مدیریت اسناد فقط برای مدیر سیستم فعال است.</span></div>}
            <section className="panel document-panel"><div className="panel-heading document-panel-heading"><div><h2>اسناد پایگاه دانش</h2><p>محتوای قابل بازیابی در گفت‌وگوهای شما</p></div><div className="document-search"><Icon name="search" size={17}/><input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="جست‌وجوی عنوان سند..." aria-label="جست‌وجوی اسناد"/></div></div>{filteredDocuments.length === 0 ? <div className="empty-table"><span><Icon name="file" size={22}/></span><strong>{documents.length ? "سندی با این جست‌وجو پیدا نشد" : "هنوز سندی ثبت نشده است"}</strong><p>{documents.length ? "عبارت دیگری را جست‌وجو کنید." : "اسناد رسمی پس از بارگذاری مدیر در این بخش نمایش داده می‌شوند."}</p></div> : <div className="document-list">{filteredDocuments.map((document) => <div className="document-row" key={document.id}><div className="document-type-icon"><Icon name={document.sourceType === "upload" ? "file" : "database"} size={20}/></div><div className="document-primary"><strong>{document.title}</strong><span>{document.fileName}</span></div><span className="scope-chip"><Icon name="building" size={13}/>{document.department}</span><span className="document-format">{document.sourceType === "upload" ? document.fileName.split(".").pop()?.toUpperCase() : "منبع داده"}</span><span className="document-size">{formatSize(document.sizeBytes)}</span><span className="document-date"><Icon name="clock" size={14}/>{formatDate(document.createdAt)}</span>{user.role === "admin" && <button type="button" className="row-icon-button delete-row-button" title="حذف سند" onClick={() => void deleteDocument(document)}><Icon name="trash" size={16}/></button>}</div>)}</div>}</section>
          </>}

          {page === "sources" && <>
            <PageTitle eyebrow={currentPage.eyebrow} title={currentPage.title} description={currentPage.description} action={user.role === "admin" ? <button className="primary-button" type="button" onClick={() => setSourceFormOpen((open) => !open)}><Icon name={sourceFormOpen ? "close" : "plus"} size={17}/>{sourceFormOpen ? "بستن فرم" : "اتصال منبع جدید"}</button> : undefined}/>
            <div className="source-summary"><div className="source-summary-icon"><Icon name="shield" size={22}/></div><div><strong>اتصال‌های داخلی، امن و کنترل‌شده</strong><span>اطلاعات هر منبع در چارچوب دامنه واحد تعیین‌شده وارد پایگاه بازیابی می‌شود.</span></div><div className="source-summary-count"><strong>{stats.sources.toLocaleString("fa-IR")}</strong><small>منبع فعال</small></div></div>
            {sourceFormOpen && user.role === "admin" && <section className="panel source-form-panel"><div className="panel-heading"><div><h2>پیکربندی منبع جدید</h2><p>دسترسی محرمانه با رمزنگاری سمت سرور نگهداری می‌شود.</p></div><span className="admin-only-chip"><Icon name="lock" size={14}/> رمزنگاری‌شده</span></div><form onSubmit={addDataSource} className="source-form"><div className="source-kind-picker"><button type="button" className={sourceKind === "url" ? "kind-card kind-selected" : "kind-card"} onClick={() => setSourceKind("url")}><span><Icon name="globe" size={19}/></span><strong>صفحه داخلی</strong><small>وب‌سایت، ویکی یا مخزن دانش</small></button><button type="button" className={sourceKind === "api" ? "kind-card kind-selected" : "kind-card"} onClick={() => setSourceKind("api")}><span><Icon name="code" size={19}/></span><strong>REST API</strong><small>داده ساخت‌یافته با GET</small></button><button type="button" className={sourceKind === "postgres" ? "kind-card kind-selected" : "kind-card"} onClick={() => setSourceKind("postgres")}><span><Icon name="server" size={19}/></span><strong>PostgreSQL</strong><small>پرس‌وجوی فقط‌خواندنی</small></button></div><div className="form-grid"><label className="field-label">نام نمایشی منبع<input className="text-input" required maxLength={100} value={sourceForm.name} onChange={(event) => setSourceForm((form) => ({ ...form, name: event.target.value }))} placeholder="مثلاً آیین‌نامه‌های اعتباری"/></label><label className="field-label">دامنه دسترسی<select className="text-input" value={sourceForm.department} onChange={(event) => setSourceForm((form) => ({ ...form, department: event.target.value }))}>{departments.map((department) => <option key={department}>{department}</option>)}</select></label></div>{sourceKind === "postgres" ? <><label className="field-label">رشته اتصال PostgreSQL<input className="text-input ltr-field" required value={sourceForm.connectionString} onChange={(event) => setSourceForm((form) => ({ ...form, connectionString: event.target.value }))} placeholder="postgresql://user:password@host:5432/database" dir="ltr" autoComplete="off"/><span className="field-hint">این مقدار رمزنگاری می‌شود و در رابط کاربری نمایش داده نخواهد شد.</span></label><label className="field-label">پرس‌وجوی فقط‌خواندنی<input className="text-input ltr-field" required value={sourceForm.query} onChange={(event) => setSourceForm((form) => ({ ...form, query: event.target.value }))} placeholder="SELECT ... FROM ... LIMIT 1000" dir="ltr"/><span className="field-hint">فقط یک SELECT یا WITH در تراکنش read-only اجرا می‌شود.</span></label></> : <><label className="field-label">نشانی منبع<input className="text-input ltr-field" required type="url" value={sourceForm.endpoint} onChange={(event) => setSourceForm((form) => ({ ...form, endpoint: event.target.value }))} placeholder="https://intranet.bank.local/knowledge" dir="ltr"/></label>{sourceKind === "api" && <label className="field-label">توکن Bearer <span className="optional-label">اختیاری</span><input className="text-input ltr-field" type="password" value={sourceForm.bearerToken} onChange={(event) => setSourceForm((form) => ({ ...form, bearerToken: event.target.value }))} placeholder="توکن دسترسی API" dir="ltr" autoComplete="new-password"/></label>}</>}<div className="source-form-footer"><div><Icon name="alert" size={15}/> اتصال هنگام همگام‌سازی از سمت سرور انجام می‌شود.</div><button className="primary-button" type="submit" disabled={sourceBusy}>{sourceBusy ? <><span className="spinner spinner-white"/> در حال ذخیره...</> : <><Icon name="check" size={17}/> ذخیره منبع</>}</button></div></form></section>}
            <section className="panel source-list-panel"><div className="panel-heading"><div><h2>اتصال‌های ثبت‌شده</h2><p>{sources.length.toLocaleString("fa-IR")} منبع پیکربندی‌شده</p></div><span className="source-list-badge"><span className="status-pulse"/>همگام‌سازی دستی</span></div>{sources.length === 0 ? <div className="empty-table"><span><Icon name="database" size={22}/></span><strong>هنوز منبعی متصل نشده است</strong><p>{user.role === "admin" ? "یک صفحه داخلی، API یا پایگاه PostgreSQL اضافه کنید." : "منابع داخلی پس از پیکربندی مدیر در این بخش نمایش داده می‌شوند."}</p></div> : <div className="source-list">{sources.map((source) => <article className={`source-row ${!source.active ? "source-inactive" : ""}`} key={source.id}><div className={`source-type-icon source-type-${source.kind}`}><Icon name={source.kind === "url" ? "globe" : source.kind === "api" ? "code" : "server"} size={20}/></div><div className="source-info"><div className="source-name-line"><strong>{source.name}</strong><span className={`connection-status ${source.active ? "connected" : "disconnected"}`}><i/>{source.active ? "فعال" : "غیرفعال"}</span></div><div className="source-meta"><span>{source.kind === "url" ? "صفحه داخلی" : source.kind === "api" ? "REST API" : "PostgreSQL"}</span><span>·</span><span>{source.department}</span><span>·</span><span><Icon name="clock" size={13}/>{source.lastSyncedAt ? `آخرین همگام‌سازی ${formatDate(source.lastSyncedAt)}` : "هنوز همگام‌سازی نشده"}</span></div>{user.role === "admin" && source.lastError && <div className="source-error-text"><Icon name="alert" size={13}/>{source.lastError}</div>}</div>{user.role === "admin" && <div className="source-actions"><button type="button" className="outline-button sync-button" disabled={!source.active || busyIds.includes(source.id)} onClick={() => void syncDataSource(source)}>{busyIds.includes(source.id) ? <span className="spinner"/> : <Icon name="sync" size={16}/>}همگام‌سازی</button><button type="button" className="row-icon-button" title={source.active ? "غیرفعال‌کردن منبع" : "فعال‌کردن منبع"} onClick={() => void toggleDataSource(source)}><Icon name={source.active ? "lock" : "check"} size={16}/></button><button type="button" className="row-icon-button delete-row-button" title="حذف اتصال" onClick={() => void deleteDataSource(source)}><Icon name="trash" size={16}/></button></div>}</article>)}</div>}</section>
          </>}

          {page === "users" && user.role === "admin" && <>
            <PageTitle eyebrow={currentPage.eyebrow} title={currentPage.title} description={currentPage.description} action={<button className="primary-button" type="button" onClick={() => setUserFormOpen((open) => !open)}><Icon name={userFormOpen ? "close" : "plus"} size={17}/>{userFormOpen ? "بستن فرم" : "افزودن کاربر"}</button>}/>
            <div className="user-overview-strip"><div className="overview-icon"><Icon name="users" size={20}/></div><div><strong>مدیریت متمرکز دسترسی</strong><span>هر کاربر فقط به اسناد عمومی و اسناد واحد سازمانی خود دسترسی دارد.</span></div><div className="overview-stat"><strong>{managedUsers.length.toLocaleString("fa-IR")}</strong><span>حساب کاربری</span></div><div className="overview-stat"><strong>{managedUsers.filter((item) => item.active).length.toLocaleString("fa-IR")}</strong><span>حساب فعال</span></div></div>
            {userFormOpen && <section className="panel user-form-panel"><div className="panel-heading"><div><h2>ساخت حساب سازمانی</h2><p>نقش و واحد کاربر، دامنه دسترسی به اسناد را تعیین می‌کند.</p></div></div><form className="user-form-grid" onSubmit={createUser}><label className="field-label">نام و نام خانوادگی<input className="text-input" required value={userForm.fullName} onChange={(event) => setUserForm((form) => ({ ...form, fullName: event.target.value }))} placeholder="نام کاربر"/></label><label className="field-label">ایمیل سازمانی<input className="text-input ltr-field" type="email" required value={userForm.email} onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))} placeholder="user@bank.ir" dir="ltr"/></label><label className="field-label">گذرواژه اولیه<input className="text-input ltr-field" type="password" required minLength={10} value={userForm.password} onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))} placeholder="حداقل ۱۰ نویسه" dir="ltr" autoComplete="new-password"/></label><label className="field-label">واحد سازمانی<select className="text-input" value={userForm.department} onChange={(event) => setUserForm((form) => ({ ...form, department: event.target.value }))}>{departments.filter((department) => department !== "عمومی").map((department) => <option key={department}>{department}</option>)}</select></label><label className="field-label">سطح دسترسی<select className="text-input" value={userForm.role} onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as "user" | "admin" }))}><option value="user">کاربر سازمانی</option><option value="admin">مدیر سیستم</option></select></label><div className="user-form-submit"><button className="primary-button" type="submit" disabled={userBusy}>{userBusy ? <><span className="spinner spinner-white"/> در حال ساخت...</> : <><Icon name="user" size={17}/>ساخت حساب</>}</button></div></form></section>}
            <section className="panel users-panel"><div className="panel-heading"><div><h2>اعضای سازمان</h2><p>نقش‌ها و وضعیت حساب‌های سامانه</p></div><span className="admin-only-chip"><Icon name="shield" size={14}/> مدیریت مدیر سیستم</span></div>{managedUsers.length === 0 ? <div className="empty-table"><span><Icon name="users" size={22}/></span><strong>کاربری ثبت نشده است</strong></div> : <div className="users-table-wrap"><table className="users-table"><thead><tr><th>کاربر</th><th>واحد سازمانی</th><th>سطح دسترسی</th><th>وضعیت</th><th>مدیریت</th></tr></thead><tbody>{managedUsers.map((managedUser) => <tr key={managedUser.id}><td><div className="table-user"><span className="table-avatar">{initials(managedUser.fullName)}</span><span><strong>{managedUser.fullName}</strong><small>{managedUser.email}</small></span></div></td><td><span className="department-table-label"><Icon name="building" size={14}/>{managedUser.department}</span></td><td><span className={`role-chip ${managedUser.role === "admin" ? "role-admin" : "role-user"}`}>{managedUser.role === "admin" ? <><Icon name="shield" size={13}/>مدیر سیستم</> : <><Icon name="user" size={13}/>کاربر</>}</span></td><td><span className={`connection-status ${managedUser.active ? "connected" : "disconnected"}`}><i/>{managedUser.active ? "فعال" : "غیرفعال"}</span></td><td><div className="user-row-actions"><button type="button" className="small-action" disabled={managedUser.id === user.id} onClick={() => void updateManagedUser(managedUser, { role: managedUser.role === "admin" ? "user" : "admin" })}>{managedUser.role === "admin" ? "تبدیل به کاربر" : "ارتقا به مدیر"}</button><button type="button" className={`small-action ${managedUser.active ? "deactivate-action" : "activate-action"}`} disabled={managedUser.id === user.id} onClick={() => void updateManagedUser(managedUser, { active: !managedUser.active })}>{managedUser.active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></div></td></tr>)}</tbody></table></div>}</section>
            <div className="access-note"><span><Icon name="lock" size={17}/></span><div><strong>کنترل دسترسی بر اساس واحد</strong><p>کاربران عادی به اسناد «عمومی» و مستندات واحد خود دسترسی دارند؛ مدیر سیستم دسترسی مدیریتی کامل دارد. همه تغییرات مدیریتی ثبت ممیزی می‌شوند.</p></div></div>
          </>}

          <footer className="workspace-footer"><span>راهیار · دستیار هوشمند دانش سازمانی</span><span><Icon name="shield" size={13}/> داده‌های بانکی در بستر امن سازمان</span></footer>
        </div>
      </section>
      {toast && <div className={`toast-message ${toast.kind === "error" ? "toast-error" : ""}`} role="status"><span className="toast-icon"><Icon name={toast.kind === "success" ? "check" : "alert"} size={17}/></span>{toast.message}<button type="button" onClick={() => setToast(null)} aria-label="بستن پیام"><Icon name="close" size={15}/></button></div>}
    </main>
  );
}
