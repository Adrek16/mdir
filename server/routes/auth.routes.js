import { Router } from "express";
import { clientIp, fail, ok, route, safeNext } from "../http.js";
import { requireGuest } from "../middleware/require-admin.js";
import { clearSessionCookie, sessionCookie } from "../session.js";
import { signIn } from "../services/auth.service.js";

/**
 * دخول وخروج المدير.
 *
 * حد بسيط لمحاولات الدخول في الذاكرة: هذا خادم محلي،
 * فلا نحتاج مخزناً خارجياً، لكن نمنع التخمين السريع.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();

function tooManyAttempts(ip) {
  const record = attempts.get(ip);
  if (!record || record.resetAt < Date.now()) return false;
  return record.count >= MAX_ATTEMPTS;
}

function registerFailure(ip) {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || record.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  record.count += 1;
}

const router = Router();

router.get("/login", requireGuest, (req, res) => {
  res.render("login", {
    title: "تسجيل الدخول",
    next: safeNext(req.query.next, "/dashboard"),
  });
});

router.post(
  "/api/auth/login",
  route(async (req, res) => {
    const ip = clientIp(req);

    if (tooManyAttempts(ip)) {
      return fail(res, 429, "محاولات كثيرة — انتظر 15 دقيقة ثم حاول مجدداً");
    }

    const result = await signIn(req.body?.email, req.body?.password);

    if (!result.ok) {
      registerFailure(ip);
      return fail(res, result.status, result.error);
    }

    attempts.delete(ip);
    res.setHeader("Set-Cookie", sessionCookie(result.signed));
    return ok(res, {
      user: { email: result.session.email },
      next: safeNext(req.body?.next, "/dashboard"),
    });
  })
);

router.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  return ok(res, { loggedOut: true });
});

export default router;
