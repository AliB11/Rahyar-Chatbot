/**
 * محدودکننده نرخ ساده در حافظه برای مسیرهای حساس (ورود و راه‌اندازی).
 *
 * فقط تلاش‌های ناموفق شمارش می‌شوند؛ بنابراین کاربر مشروع با گذرواژه درست
 * هرگز قفل نمی‌شود، اما حمله آزمون‌وخطا پس از سقف مجاز متوقف می‌شود.
 *
 * نکته: این شمارنده در حافظه هر فرایند نگهداری می‌شود و برای استقرار چند-نمونه‌ای
 * باید با یک ذخیره‌ساز مشترک (مثل Redis) جایگزین شود.
 */

const WINDOW_MS = 10 * 60 * 1000; // ۱۰ دقیقه
const MAX_FAILED_ATTEMPTS = 8;

type Bucket = { count: number; resetAt: number };

const globalForRateLimit = globalThis as typeof globalThis & {
  __rahyarAuthRateBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForRateLimit.__rahyarAuthRateBuckets) {
    globalForRateLimit.__rahyarAuthRateBuckets = new Map();
  }
  return globalForRateLimit.__rahyarAuthRateBuckets;
}

/** نشانی IP درخواست را استخراج می‌کند (با درنظرگرفتن پراکسی سازمانی). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** آیا این کلید از سقف تلاش‌های ناموفق گذشته است؟ */
export function isRateLimited(key: string): boolean {
  const bucket = buckets().get(key);
  return Boolean(bucket && bucket.resetAt > Date.now() && bucket.count > MAX_FAILED_ATTEMPTS);
}

/** یک تلاش ناموفق ثبت می‌کند. */
export function registerAuthFailure(key: string) {
  const now = Date.now();
  const map = buckets();
  if (map.size > 1000) {
    for (const [bucketKey, bucket] of map) {
      if (bucket.resetAt <= now) map.delete(bucketKey);
    }
  }
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

/** شمارنده کلید را پس از موفقیت صفر می‌کند. */
export function clearRateLimit(key: string) {
  buckets().delete(key);
}
