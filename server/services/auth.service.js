import { sbAuthPassword, sbSelect, sbUpdate, sbAdminUpdateUser } from "../supabase.js";
import { signSession, SESSION_TTL_MS } from "../session.js";

/**
 * مصادقة المدير عبر Supabase Auth.
 *
 * الدور يُقرأ من جدول `profiles` — لا يُقبل من استجابة المصادقة
 * ولا من أي قيمة يرسلها المتصفح.
 *
 * الدخول يدعم البريد الإلكتروني أو اسم المستخدم:
 *  - إن كان الإدخال يحوي "@" → يُعامل كبريد.
 *  - وإلا → يُبحث في profiles عن بريد يطابق اسم المستخدم.
 */

/** قاعدة التحقق من اسم مستخدم صالح (حروف إنجليزية، أرقام، نقطة، شرطة، شرطة سفلية). */
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** قواعد كلمة المرور: 8 أحرف على الأقل، حرف ورقم على الأقل. */
export function validatePassword(password) {
  const pwd = String(password ?? "");
  if (pwd.length < 8) return "كلمة المرور قصيرة جداً (8 أحرف على الأقل)";
  if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) return "كلمة المرور يجب أن تحوي حروفاً وأرقاماً";
  return null;
}

/** يتحقق من أن اسم المستخدم صالح. */
export function validateUsername(username) {
  const name = String(username ?? "").trim();
  if (!name) return "أدخل اسم المستخدم";
  if (!USERNAME_RE.test(name)) return "اسم المستخدم: 3–32 حرفاً (حروف، أرقام، . _ -)";
  return null;
}

/**
 * يحوّل الإدخال إلى بريد إلكتروني صالح للدخول.
 * - إن كان البريد يحوي "@" يُعاد كما هو (بعد تنظيف).
 * - وإلا يُبحث عن اسم مستخدم في auth.users (user_metadata) ثم في profiles (full_name).
 */
async function resolveEmail(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  // بريد مباشر
  if (value.includes("@")) return value.toLowerCase();
  // اسم مستخدم — ابحث في profiles عن full_name مطابق (مدير فقط)
  const safeName = encodeURIComponent(value);
  try {
    const rows = await sbSelect(
      "profiles",
      `select=email&full_name=eq.${safeName}&role=eq.admin&limit=1`
    );
    if (Array.isArray(rows) && rows.length > 0 && rows[0].email) {
      return rows[0].email;
    }
    return "";
  } catch {
    return "";
  }
}

export async function signIn(identifierInput, password) {
  const secret = String(password ?? "");

  if (!identifierInput || !secret) {
    return { ok: false, status: 400, error: "أدخل البريد أو اسم المستخدم وكلمة المرور" };
  }

  // حل الإدخال إلى بريد
  const email = await resolveEmail(identifierInput);
  if (!email) {
    return { ok: false, status: 401, error: "البريد أو كلمة المرور غير صحيحة" };
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
      `select=id,email,role,full_name&id=eq.${encodeURIComponent(token.userId)}&limit=1`
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
    fullName: profile.full_name || "",
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

/**
 * يغيّر كلمة مرور المدير عبر Supabase Admin API.
 * يتحقق أولاً من كلمة المرور الحالية بمحاولة دخول بها.
 */
export async function changePassword(uid, currentPassword, newPassword) {
  const current = String(currentPassword ?? "");
  const next = String(newPassword ?? "");

  if (!current || !next) {
    return { ok: false, error: "أدخل كلمة المرور الحالية والجديدة" };
  }

  const pwErr = validatePassword(next);
  if (pwErr) return { ok: false, error: pwErr };

  if (current === next) {
    return { ok: false, error: "كلمة المرور الجديدة لا يمكن أن تكون نفس الحالية" };
  }

  // تأكد أن كلمة المرور الحالية صحيحة قبل السماح بالتغيير
  // بإعادة جلب بريد المستخدم ومحاولة الدخول
  let profile;
  try {
    const rows = await sbSelect(
      "profiles",
      `select=email&id=eq.${encodeURIComponent(uid)}&limit=1`
    );
    profile = Array.isArray(rows) ? rows[0] : null;
  } catch {
    return { ok: false, error: "تعذّر قراءة بيانات الحساب" };
  }

  if (!profile?.email) return { ok: false, error: "تعذّر تحديد الحساب" };

  try {
    await sbAuthPassword(profile.email, current);
  } catch (error) {
    if (error.status === 503) return { ok: false, error: "تعذّر الاتصال بخادم المصادقة" };
    return { ok: false, error: "كلمة المرور الحالية غير صحيحة" };
  }

  // حدّث كلمة المرور عبر Admin API
  try {
    await sbAdminUpdateUser(uid, { password: next });
  } catch (error) {
    return { ok: false, error: error.message || "تعذّر تحديث كلمة المرور" };
  }

  return { ok: true };
}

/**
 * يضبط أو يحدّث اسم المستخدم للمدير.
 * يُخزَّن في profiles.full_name ويُستخدم لتسجيل الدخول بدل البريد.
 * يتحقق من الصيغة ومن عدم استخدامه من قبل مدير آخر.
 */
export async function updateUsername(uid, username) {
  const err = validateUsername(username);
  if (err) return { ok: false, error: err };

  const name = String(username).trim();

  // تحقق من عدم التكرار (مدير آخر يستخدم نفس الاسم)
  try {
    const safeName = encodeURIComponent(name);
    const rows = await sbSelect(
      "profiles",
      `select=id&full_name=eq.${safeName}&id=neq.${encodeURIComponent(uid)}&role=eq.admin&limit=1`
    );
    if (Array.isArray(rows) && rows.length > 0) {
      return { ok: false, error: "اسم المستخدم مستخدم من قبل حساب آخر" };
    }
  } catch {
    return { ok: false, error: "تعذّر التحقق من تكرار اسم المستخدم" };
  }

  // حدّث profiles.full_name
  try {
    await sbUpdate(
      "profiles",
      `id=eq.${encodeURIComponent(uid)}`,
      { full_name: name }
    );
  } catch (error) {
    return { ok: false, error: error.message || "تعذّر حفظ اسم المستخدم" };
  }

  return { ok: true, username: name };
}

/**
 * يجلب بيانات حساب المدير (لعرضها في شاشة حسابي).
 */
export async function getAccountInfo(uid) {
  try {
    const rows = await sbSelect(
      "profiles",
      `select=id,email,full_name,role,created_at&id=eq.${encodeURIComponent(uid)}&limit=1`
    );
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile) return { ok: false, error: "تعذّر قراءة بيانات الحساب" };
    return {
      ok: true,
      account: {
        id: profile.id,
        email: profile.email || "",
        username: profile.full_name || "",
        fullName: profile.full_name || "",
        role: profile.role,
        createdAt: profile.created_at,
      },
    };
  } catch {
    return { ok: false, error: "تعذّر قراءة بيانات الحساب" };
  }
}
