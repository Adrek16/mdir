import { env } from "./env.js";

/**
 * عميل Supabase REST — بلا SDK.
 *
 * لماذا REST؟
 *  - لا نضيف حزمة ثقيلة لمجرد قراءة جداول.
 *  - يعمل مع Node 22 مباشرة عبر fetch.
 *  - مفتاح service_role يبقى هنا على الخادم فقط.
 */

export class SupabaseError extends Error {
  constructor(message, status = 500, code = "") {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
  }
}

const baseHeaders = {
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
};

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function request(path, { method = "GET", body, prefer, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      // لا نترك الواجهة معلّقة إلى الأبد عند تعثّر الشبكة.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SupabaseError("تعذّر الاتصال بـ Supabase", 503);
  }

  const data = await parseBody(response);

  if (!response.ok) {
    const message =
      (typeof data === "object" && (data?.message || data?.hint || data?.details)) ||
      "خطأ من Supabase";
    throw new SupabaseError(String(message), response.status, data?.code || "");
  }

  return data;
}

export function sbSelect(table, query = "") {
  return request(query ? `${table}?${query}` : table);
}

export function sbInsert(table, rows) {
  return request(table, {
    method: "POST",
    body: rows,
    prefer: "return=representation",
  });
}

export function sbUpsert(table, rows, onConflict) {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  return request(`${table}${suffix}`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

export function sbUpdate(table, filter, patch) {
  return request(`${table}?${filter}`, {
    method: "PATCH",
    body: patch,
    prefer: "return=representation",
  });
}

export function sbRpc(name, args = {}) {
  return request(`rpc/${name}`, { method: "POST", body: args });
}

export function sbDelete(table, filter) {
  return request(`${table}?${filter}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
}

/**
 * عدد الصفوف المطابقة بلا تحميلها.
 * PostgREST يعيد العدد في ترويسة `content-range` عند طلب HEAD.
 */
export async function sbCount(table, query = "") {
  let response;
  try {
    response = await fetch(`${env.supabaseUrl}/rest/v1/${table}?select=id&${query}`, {
      method: "HEAD",
      headers: { ...baseHeaders, Prefer: "count=exact" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SupabaseError("تعذّر الاتصال بـ Supabase", 503);
  }

  if (!response.ok) {
    throw new SupabaseError("تعذّر حساب عدد الصفوف", response.status);
  }

  const total = Number((response.headers.get("content-range") || "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

/** تبادل بريد/كلمة مرور بجلسة Supabase Auth. */
export async function sbAuthPassword(email, password) {
  let response;
  try {
    response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SupabaseError("تعذّر الاتصال بخادم المصادقة", 503);
  }

  const data = await parseBody(response);
  const raw = `${data?.error_description ?? ""} ${data?.msg ?? ""} ${data?.message ?? ""}`.toLowerCase();

  if (!response.ok || !data?.access_token || !data?.user?.id) {
    const invalid = raw.includes("invalid login credentials");
    const disabled = raw.includes("email not confirmed") || raw.includes("not confirmed");
    throw new SupabaseError(
      invalid
        ? "البريد أو كلمة المرور غير صحيحة"
        : disabled
          ? "الحساب غير مُفعّل — راجع بريدك لتأكيد الحساب"
          : "تعذّر تسجيل الدخول — حاول مرة أخرى",
      response.status || 401
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: String(data.user.id),
  };
}

/** تحديث مستخدم عبر Supabase Auth Admin API (تغيير كلمة المرور…). */
export async function sbAdminUpdateUser(uid, payload) {
  let response;
  try {
    response = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      method: "PUT",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SupabaseError("تعذّر الاتصال بخادم المصادقة", 503);
  }

  const data = await parseBody(response);

  if (!response.ok) {
    const raw = `${data?.error_description ?? ""} ${data?.msg ?? ""} ${data?.message ?? ""}`.toLowerCase();
    const msg = raw.includes("password") && raw.includes("weak")
      ? "كلمة المرور ضعيفة جداً"
      : String(data?.message || data?.msg || "تعذّر تحديث المستخدم");
    throw new SupabaseError(msg, response.status);
  }

  return data;
}

/** يجلب كائن الإيصال من المخزن الخاص ويعيد Response كما هو. */
export async function sbFetchObject(bucket, objectPath) {
  const safePath = String(objectPath)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  try {
    return await fetch(
      `${env.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${safePath}`,
      { headers: baseHeaders, cache: "no-store" }
    );
  } catch {
    throw new SupabaseError("تعذّر قراءة ملف الإيصال", 503);
  }
}

/** يرمّز مسار الكائن بأمان (كل مقطع على حدة). */
export function storageObjectPath(objectPath) {
  return String(objectPath ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** رابط عام لكائن داخل bucket عام — للمعاينة داخل لوحة المدير. */
export function sbPublicUrl(bucket, objectPath) {
  const base = env.supabaseUrl.replace(/\/$/, "");
  const path = storageObjectPath(objectPath);
  if (!path) return null;
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path}`;
}

/**
 * رفع كائن إلى Supabase Storage بمفتاح service_role.
 * الخادم فقط: لا تصل هذه الدالة للمتصفح أبداً، ولا تُقبل مسارات من العميل.
 */
export async function sbUploadObject(bucket, objectPath, bytes, contentType, { upsert = false } = {}) {
  const path = storageObjectPath(objectPath);
  if (!path) throw new SupabaseError("مسار الملف غير صالح", 400);

  let response;
  try {
    response = await fetch(
      `${env.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,
      {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": contentType,
          "x-upsert": upsert ? "true" : "false",
        },
        body: bytes,
        cache: "no-store",
      }
    );
  } catch {
    throw new SupabaseError("تعذّر الاتصال بمخزن الملفات", 503);
  }

  if (!response.ok) {
    await response.text().catch(() => "");
    throw new SupabaseError(`تعذّر رفع الملف (${response.status})`, response.status);
  }

  return sbPublicUrl(bucket, objectPath);
}

/** حذف كائنات من مخزن (استبدال الشعار/صور المنتجات). */
export async function sbRemoveObject(bucket, objectPaths) {
  const paths = (Array.isArray(objectPaths) ? objectPaths : [objectPaths])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (!paths.length) return;

  try {
    await fetch(`${env.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: { ...baseHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
      cache: "no-store",
    });
  } catch {
    // الحذف تنظيفية — لا يُفشل الحفظ الأساسي.
    console.warn("[storage] تعذّر حذف ملفات قديمة");
  }
}
