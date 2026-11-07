import process from "node:process";

/**
 * قراءة متغيرات البيئة والتحقق منها مرة واحدة عند الإقلاع.
 *
 * لا توجد قيم احتياطية للمفاتيح: إن نقص مفتاح نتوقف برسالة واضحة
 * بدل أن يعمل الخادم ببيانات ناقصة ويكتشف المدير المشكلة لاحقاً.
 */

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[env] المتغير ${name} مطلوب في ملف .env`);
    process.exit(1);
  }
  return value;
}

const port = Number(process.env.PORT || 4100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[env] PORT غير صالح");
  process.exit(1);
}

export const env = Object.freeze({
  host: process.env.HOST?.trim() || "127.0.0.1",
  port,
  isProduction: process.env.NODE_ENV === "production",

  supabaseUrl: required("SUPABASE_URL").replace(/\/+$/, ""),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  sessionSecret: required("SESSION_SECRET"),

  storeUrl: (process.env.STORE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, ""),
  revalidateUrl: process.env.STORE_REVALIDATE_URL?.trim() || "",
  revalidateSecret: process.env.STORE_REVALIDATE_SECRET?.trim() || "",
});
