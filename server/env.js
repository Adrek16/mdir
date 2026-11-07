import process from "node:process";

/**
 * قراءة متغيرات البيئة والتحقق منها مرة واحدة عند الإقلاع.
 *
 * محلياً: أي متغير ناقص يوقف الخادم فوراً برسالة واضحة.
 * داخل دالة Netlify: لا نستدعي process.exit، لأنه يقتل وقت تشغيل Lambda
 * ويظهر للمستخدم "This function has crashed / exit status 1". نكمل بقيم
 * آمنة، ويعرض server/app.js صفحة إعداد واضحة بدلاً من ذلك.
 */

const isServerless = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.NETLIFY_DEV
);

const missing = [];

function required(name, serverlessPlaceholder = "") {
  const value = process.env[name]?.trim();
  if (!value) {
    missing.push(name);
    console.error(`[env] المتغير ${name} مطلوب في ملف .env`);
    if (!isServerless) process.exit(1);
    return serverlessPlaceholder;
  }
  return value;
}

let port = Number(process.env.PORT || 4100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[env] PORT غير صالح — استخدام 4100");
  if (!isServerless) process.exit(1);
  port = 4100;
}

const supabaseUrl = required("SUPABASE_URL", "https://unconfigured.invalid").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const sessionSecret = required("SESSION_SECRET");

/**
 * في الاستضافة العامة يُحقن PORT من المنصة والخادم يجب أن يستمع على كل
 * الواجهات؛ محلياً نبقيه على 127.0.0.1 حتى لا يُكشف على الشبكة المحلية.
 */
const host =
  process.env.HOST?.trim() ||
  (process.env.NODE_ENV === "production" || isServerless ? "0.0.0.0" : "127.0.0.1");

/** رابط الموقع العام (اختياري) — يُستخدم للتحقق من Origin وتوليد روابط مطلقة. */
const publicSiteUrl = (process.env.PUBLIC_SITE_URL?.trim() || "").replace(/\/+$/, "");

/** قائمة عناوين IP مسموح بها للوصول للوحة (اختياري، مفصولة بفواصل). */
const adminIpAllowlist = Object.freeze(
  (process.env.ADMIN_IP_ALLOWLIST?.trim() || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

export const env = Object.freeze({
  host,
  port,
  // Netlify Functions لا تضمن NODE_ENV=production وقت التنفيذ؛ كوكي الجلسة
  // يجب أن يحمل Secure لأن الموقع يُخدَم عبر HTTPS.
  isProduction:
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT),

  // هل الاعداد مكتمل؟ وأسماء المتغيرات الناقصة لعرضها في صفحة الإعداد.
  isConfigured: missing.length === 0,
  missingEnv: Object.freeze([...missing]),

  supabaseUrl,
  serviceRoleKey,
  sessionSecret,

  /**
   * رابط واجهة المتجر للعملاء. لا يوجد افتراض localhost على موقع منشور؛
   * إن لم يُضبط يُخفى زر «المتجر» بدل أن يشير إلى جهاز الزائر.
   */
  storeUrl: (process.env.STORE_URL?.trim() || "").replace(/\/+$/, ""),

  /** الرابط العام للوحة — للتحقق من Origin في طلبات التعديل. */
  publicSiteUrl,
  adminIpAllowlist,

  revalidateUrl: process.env.STORE_REVALIDATE_URL?.trim() || "",
  revalidateSecret: process.env.STORE_REVALIDATE_SECRET?.trim() || "",

  /** تحديث كاش المتجر يعمل فقط عند ضبط الرابط والسر معاً. */
  canRevalidate: Boolean(
    process.env.STORE_REVALIDATE_URL?.trim() && process.env.STORE_REVALIDATE_SECRET?.trim()
  ),
});
