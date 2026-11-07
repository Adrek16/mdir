/**
 * أدوات HTTP صغيرة: ردود موحّدة، قراءة JSON، وحماية `next`.
 *
 * كل ردود الـ API بالشكل:
 *   { ok: true,  data: ... }
 *   { ok: false, error: "رسالة عربية" }
 */

export function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export function fail(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

/** يمنع إعادة التوجيه لموقع خارجي عبر `?next=`. */
export function safeNext(value, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/** عنوان IP للعميل — للحد من محاولات الدخول. */
export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "local";
}

/** يغلّف route غير متزامن ويمرر الأخطاء إلى معالج Express. */
export const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
