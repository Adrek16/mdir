import { Router } from "express";
import { clientIp, fail, ok, route, safeNext } from "../http.js";
import { requireGuest } from "../middleware/require-admin.js";
import { clearSessionCookie, sessionCookie } from "../session.js";
import {
  clearThrottleCookie,
  isBlocked,
  nextFailure,
  readThrottle,
  throttleCookie,
} from "../throttle.js";
import { signIn } from "../services/auth.service.js";

/**
 * دخول وخروج المدير.
 *
 * حدّ محاولات الدخول مخزّن في كوكي موقّع (server/throttle.js) لا في ذاكرة
 * العملية، كي يبقى سارياً بين استدعاءات دالة Netlify. الحدّ النهائي على
 * تخمين كلمات المرور هو حدّ Supabase Auth نفسه.
 */

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
    const state = readThrottle(req, ip);

    if (isBlocked(state)) {
      return fail(res, 429, "محاولات كثيرة — انتظر 15 دقيقة ثم حاول مجدداً");
    }

    const result = await signIn(req.body?.email, req.body?.password);

    if (!result.ok) {
      res.setHeader("Set-Cookie", throttleCookie(nextFailure(state), ip));
      return fail(res, result.status, result.error);
    }

    // كوكيان: مسح عدّاد المحاولات + إنشاء الجلسة.
    res.setHeader("Set-Cookie", [clearThrottleCookie(), sessionCookie(result.signed)]);
    return ok(res, {
      user: { email: result.session.email },
      next: safeNext(req.body?.next, "/dashboard"),
    });
  })
);

router.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", [clearSessionCookie(), clearThrottleCookie()]);
  return ok(res, { loggedOut: true });
});

export default router;
