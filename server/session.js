import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

/**
 * جلسة المدير: كوكي HttpOnly موقّع بـ HMAC-SHA256.
 *
 * لماذا لا نخزّن الجلسة في sessionStorage؟
 *  - أي سكربت في الصفحة يستطيع قراءتها (XSS).
 *  - لا يمكن الاعتماد على قيمة يرسلها المتصفح للحماية.
 *
 * الكوكي يحمل فقط: معرّف المستخدم، بريده، دوره، ووقت الانتهاء.
 * والتوقيع يمنع أي تعديل عليه.
 */

export const SESSION_COOKIE = "stoor_manager";

/** مدة الجلسة: 8 ساعات — كافية ليوم عمل، ثم يُطلب الدخول مجدداً. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function hmac(payload) {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

/** يبني قيمة الكوكي: base64url(JSON) + "." + التوقيع */
export function signSession(session) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

/** يفك التوقيع ويتحقق من الصلاحية. يعيد null عند أي خلل. */
export function verifySession(raw) {
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = hmac(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session?.uid || !session?.exp || session.exp < Date.now()) return null;
    if (session.role !== "admin") return null;
    return session;
  } catch {
    return null;
  }
}

/** يفك ترويسة Cookie إلى كائن بسيط. */
export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(/;\s*/)) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** كوكي الجلسة — HttpOnly وSameSite، وSecure في الإنتاج فقط. */
export function sessionCookie(value, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ];
  if (env.isProduction) parts.push("Secure");
  return parts.join("; ");
}

/** كوكي يمسح الجلسة عند الخروج. */
export function clearSessionCookie() {
  return sessionCookie("", 0);
}
