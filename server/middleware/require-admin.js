import { fail } from "../http.js";
import { parseCookies, SESSION_COOKIE, verifySession } from "../session.js";

/**
 * حارس الصفحات والـ API.
 *
 * الصفحات المحمية لا يُرسل لها HTML أصلاً قبل التحقق،
 * والـ API يرد 401 بصيغة JSON ليعرف العميل أن الجلسة انتهت.
 */

/** يقرأ الجلسة من الكوكي ويتحقق من توقيعها. */
export function readSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifySession(cookies[SESSION_COOKIE]);
}

function wantsJson(req) {
  return req.path.startsWith("/api/") || req.path === "/api";
}

export function requireAdmin(req, res, next) {
  const session = readSession(req);

  if (!session) {
    if (wantsJson(req)) {
      return fail(res, 401, "انتهت الجلسة — سجّل الدخول مجدداً");
    }

    const next = encodeURIComponent(req.originalUrl || "/dashboard");
    return res.redirect(`/login?next=${next}`);
  }

  req.admin = session;
  res.locals.admin = session;
  return next();
}

/** صفحة الدخول فقط للزائر — المسجّل يُحوَّل للوحة. */
export function requireGuest(req, res, next) {
  if (readSession(req)) return res.redirect("/dashboard");
  return next();
}
