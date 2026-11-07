/**
 * إعدادات مشتركة لسكربتات القبول والصيانة.
 *
 * لا يحتوي هذا المستودع على أي بيانات دخول أو عناوين خادم ثابتة:
 * كل شيء يُقرأ من متغيرات البيئة (ملف .env محلياً، أو متغيرات المنصة).
 * شغّل السكربتات عبر `npm run ...` لأنها تستخدم `--env-file=.env`.
 */

function read(name, hint = "") {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    console.error(`[config] المتغير المطلوب ${name} غير مضبوط.`);
    if (hint) console.error(`[config] ${hint}`);
    console.error("[config] اضبطه في .env (أو في بيئة التشغيل) ثم أعد المحاولة.");
    process.exit(2);
  }
  return value;
}

function url(name, hint = "") {
  return read(name, hint).replace(/\/+$/, "");
}

/** عنوان لوحة المدير: محلي أو مستضاف على الإنترنت. */
export const managerUrl = () =>
  url("MANAGER_URL", "مثال: http://127.0.0.1:4100 أو https://your-dashboard.netlify.app");

/** عنوان واجهة المتجر (تحتاجه اختبارات القبول للتحقق من الروابط). */
export const storeUrl = () =>
  url("STORE_URL", "مثال: https://store.example.com أو http://127.0.0.1:3000");

/** بيانات Supabase اللازمة للتنظيف المباشر بعد الاختبارات. */
export const supabaseConfig = () => ({
  supabaseUrl: url("SUPABASE_URL"),
  serviceKey: read("SUPABASE_SERVICE_ROLE_KEY"),
});

/** حساب المدير المستخدم في اختبارات القبول — من البيئة فقط. */
export const adminCredentials = () => ({
  email: read("ADMIN_EMAIL"),
  password: read("ADMIN_PASSWORD"),
});

/**
 * عنوان الخادم المحلي للسكربتات التي توقّع جلستها بنفسها أو تشغّل
 * الخادم داخل العملية. يقرأ HOST/PORT إن وُجدا، وإلا يفترض التطوير المحلي.
 */
export function localManagerUrl() {
  const host = String(process.env.HOST || "127.0.0.1").trim();
  const port = String(process.env.PORT || 4100).trim();
  return `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
}
