import { sbAuthPassword, sbSelect } from "../supabase.js";
import { signSession, SESSION_TTL_MS } from "../session.js";

/**
 * مصادقة المدير عبر Supabase Auth.
 *
 * الدور يُقرأ من جدول `profiles` — لا يُقبل من استجابة المصادقة
 * ولا من أي قيمة يرسلها المتصفح.
 */

/** يوحّد البريد: كتابة `admin` تعني `admin@stoor.local`. */
export function normalizeEmail(input) {
  const email = String(input ?? "").trim().toLowerCase();
  if (!email) return "";
  return email.includes("@") ? email : `${email}@stoor.local`;
}

export async function signIn(emailInput, password) {
  const email = normalizeEmail(emailInput);
  const secret = String(password ?? "");

  if (!email || !secret) {
    return { ok: false, status: 400, error: "أدخل البريد وكلمة المرور" };
  }

  let token;
  try {
    token = await sbAuthPassword(email, secret);
  } catch (error) {
    return {
      ok: false,
      status: error.status === 503 ? 503 : 401,
      error: error.message || "تعذّر تسجيل الدخول",
    };
  }

  let profile = null;
  try {
    const rows = await sbSelect(
      "profiles",
      `select=id,email,role&id=eq.${encodeURIComponent(token.userId)}&limit=1`
    );
    profile = Array.isArray(rows) ? rows[0] : null;
  } catch {
    return { ok: false, status: 500, error: "تعذّر قراءة صلاحيات الحساب" };
  }

  if (!profile) {
    return { ok: false, status: 403, error: "لا يوجد ملف مستخدم مرتبط بهذا الحساب" };
  }

  if (profile.role !== "admin") {
    return { ok: false, status: 403, error: "هذا الحساب لا يملك صلاحية إدارة المتجر" };
  }

  const now = Date.now();
  const session = {
    uid: String(profile.id),
    email: profile.email || email,
    role: "admin",
    iat: now,
    exp: now + SESSION_TTL_MS,
  };

  const signed = signSession(session);
  if (!signed) {
    return { ok: false, status: 500, error: "جلسة الدخول غير مُهيّأة على الخادم" };
  }

  return { ok: true, session, signed };
}
