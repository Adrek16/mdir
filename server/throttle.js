import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";
import { parseCookies } from "./session.js";

/**
 * حدّ محاولات الدخول بدون ذاكرة خادم.
 *
 * على Netlify تُشغَّل كل نسخة من الدالة في حاوية مستقلة، فأي Map في الذاكرة
 * يُمسح عند كل برودة تشغيل ولا يمنع تخمين كلمات المرور فعلياً. الحل هنا
 * كوكي HttpOnly موقّع بـ HMAC يحمل العدّاد ونافذة الوقت، فيبقى سارياً عبر
 * كل النسخ لأن التوقيع يُتحقق منه على الخادم ولا يمكن تعديله من المتصفح.
 *
 * ملاحظة أمنية صريحة: حذف الكوكي يدوياً يبدأ نافذة جديدة، لذلك تُعتبر هذه
 * الطبقة رادعاً، بينما يبقى الحدّ الحقيقي هو حدّ Supabase Auth على
 * `/auth/v1/token`. وللوحة إدارية عامة يُنصح بـ ADMIN_IP_ALLOWLIST أو حماية
 * الموقع بكلمة مرور على مستوى المنصة.
 */

export const THROTTLE_COOKIE = "stoor_throttle";
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_LOGIN_ATTEMPTS = 8;

const WINDOW_SECONDS = Math.floor(THROTTLE_WINDOW_MS / 1000);

function hmac(payload) {
  return createHmac("sha256", env.sessionSecret)
    .update(`throttle:${payload}`)
    .digest("base64url");
}

/** بصمة قصيرة للعنوان — تمنع إعادة استخدام الكوكي من عنوان آخر. */
function ipKey(ip) {
  return createHash("sha256")
    .update(`${env.sessionSecret}|${ip}`)
    .digest("base64url")
    .slice(0, 16);
}

const empty = { count: 0, resetAt: 0 };

/** يقرأ حالة المحاولات من الكوكي الموقّع، ويعيد حالة فارغة عند أي تلاعب. */
export function readThrottle(req, ip) {
  const raw = parseCookies(req.headers.cookie)[THROTTLE_COOKIE];
  if (!raw) return { ...empty };

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return { ...empty };

  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const a = Buffer.from(signature);
  const b = Buffer.from(hmac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ...empty };

  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (state.k !== ipKey(ip)) return { ...empty };
    if (!Number.isFinite(state.count) || !Number.isFinite(state.resetAt)) return { ...empty };
    if (state.resetAt < Date.now()) return { ...empty };
    return { count: state.count, resetAt: state.resetAt };
  } catch {
    return { ...empty };
  }
}

export function throttleCookie(state, ip) {
  const payload = Buffer.from(
    JSON.stringify({ count: state.count, resetAt: state.resetAt, k: ipKey(ip) }),
    "utf8"
  ).toString("base64url");
  const value = `${payload}.${hmac(payload)}`;

  const parts = [
    `${THROTTLE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${WINDOW_SECONDS}`,
  ];
  if (env.isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function clearThrottleCookie() {
  const parts = [
    `${THROTTLE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (env.isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function isBlocked(state) {
  return state.resetAt > Date.now() && state.count >= MAX_LOGIN_ATTEMPTS;
}

/** يسجّل محاولة فاشلة، مع فتح نافذة جديدة عند انتهاء القديمة. */
export function nextFailure(state) {
  const now = Date.now();
  if (!state.resetAt || state.resetAt < now) {
    return { count: 1, resetAt: now + THROTTLE_WINDOW_MS };
  }
  return { count: state.count + 1, resetAt: state.resetAt };
}
