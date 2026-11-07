import { Router } from "express";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import {
  changePassword,
  updateUsername,
  getAccountInfo,
} from "../services/auth.service.js";

/**
 * شاشة «حسابي» — يرى فيها المدير بياناته ويغيّر كلمة المرور واسم المستخدم.
 *
 * جميع العمليات تتم على الخادم بـ service_role؛ لا تصل كلمات المرور
 * إلى المتصفح ولا تُخزَّن في أي مكان خارج Supabase Auth.
 */

const router = Router();

// صفحة HTML
router.get("/account", requireAdmin, (req, res) => {
  res.render("account", {
    title: "حسابي",
    active: "account",
    pageScript: "account",
    pageCss: "account",
  });
});

// API: بيانات الحساب
router.get(
  "/api/account",
  requireAdmin,
  route(async (req, res) => {
    const result = await getAccountInfo(req.admin.uid);
    if (!result.ok) return fail(res, 400, result.error);
    return ok(res, { account: result.account });
  })
);

// API: تغيير كلمة المرور
router.post(
  "/api/account/password",
  requireAdmin,
  route(async (req, res) => {
    const result = await changePassword(
      req.admin.uid,
      req.body?.currentPassword,
      req.body?.newPassword
    );
    if (!result.ok) return fail(res, 400, result.error);
    return ok(res, { changed: true });
  })
);

// API: ضبط/تحديث اسم المستخدم
router.post(
  "/api/account/username",
  requireAdmin,
  route(async (req, res) => {
    const result = await updateUsername(req.admin.uid, req.body?.username);
    if (!result.ok) return fail(res, 400, result.error);
    return ok(res, { username: result.username });
  })
);

export default router;
