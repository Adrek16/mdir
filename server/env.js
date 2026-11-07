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

const port = Number(process.env.PORT || 4100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[env] PORT غير صالح");
  process.exit(1);
}

const supabaseUrl = required("SUPABASE_URL", "https://unconfigured.invalid").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const sessionSecret = required("SESSION_SECRET");

export const env = Object.freeze({
  host: process.env.HOST?.trim() || "127.0.0.1",
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

  storeUrl: (process.env.STORE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, ""),
  revalidateUrl: process.env.STORE_REVALIDATE_URL?.trim() || "",
  revalidateSecret: process.env.STORE_REVALIDATE_SECRET?.trim() || "",
});
