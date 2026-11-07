/**
 * تحقّق شامل (تشغيل يدوي): يشغّل تطبيق Express داخل العملية نفسها
 * ويمرّ عبر مسارات «معلومات المتجر» و«صور المنتجات» بجلسة مدير موقّعة.
 *
 * التشغيل: node --env-file=.env scripts/verify-feature.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { signSession, SESSION_COOKIE } = await import("../server/session.js");

const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({
    uid: "00000000-0000-0000-0000-000000000000",
    email: "verify@local",
    role: "admin",
    iat: now,
    exp: now + 60 * 60 * 1000,
  })
)}`;

const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const mod = await import("../server/index.js").catch((error) => ({ error }));
  if (!mod?.default && mod?.error) throw mod.error;

  // server/index.js يستمع مباشرة؛ نستخدم fetch على المنفذ.
  const base = `http://127.0.0.1:${process.env.PORT || 4100}`;

  const get = async (path, headers = {}) =>
    fetch(base + path, { headers: { cookie, ...headers }, redirect: "manual" });

  // صفحة معلومات المتجر
  const page = await get("/store-info");
  const pageHtml = await page.text();
  check("/store-info يفتح (200)", page.status === 200, `status=${page.status}`);
  check("الصفحة تحمّل سكربت store-info", pageHtml.includes("pages/store-info.js"));
  check("الصفحة تحمّل ستايل store-info", pageHtml.includes("pages/store-info.css"));
  check("حقل الشعار موجود", pageHtml.includes("logo"));
  check("حقل رسالة الترحيب موجود", pageHtml.includes("welcomeLine1") || pageHtml.includes("welcome"));

  // قراءة الإعدادات
  const read = await get("/api/store-info");
  const readJson = await read.json().catch(() => null);
  check("GET /api/store-info يعمل", read.status === 200 && readJson?.ok === true, `status=${read.status}`);
  const info = readJson?.data?.info ?? {};
  check("يحتوي على اسم المتجر", typeof info.name === "string" && info.name.length > 0, info.name);
  check("يحتوي على social كائن", info.social && typeof info.social === "object");

  // حفظ القيم كما هي (اختبار ذهاب وعودة)
  const put = await fetch(base + "/api/store-info", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(info),
  });
  const putJson = await put.json().catch(() => null);
  check("PUT /api/store-info يحفظ", put.status === 200 && putJson?.ok === true,
    `status=${put.status} ${putJson?.error ?? ""}`);

  // رفض مدخلات غير صالحة
  const bad = await fetch(base + "/api/store-info", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ...info, name: "", mapUrl: "javascript:alert(1)" }),
  });
  const badJson = await bad.json().catch(() => null);
  check("يرفض الاسم الفارغ والرابط الخبيث", bad.status === 400 && badJson?.ok === false, badJson?.error ?? "");

  // رفض مسار شعار غير آمن
  const badLogo = await fetch(base + "/api/store-info", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ...info, logoPath: "../secret.png" }),
  });
  check("يرفض مسار شعار فيه ..", badLogo.status === 400);

  // رفع شعار غير صورة (نوع غير مسموح)
  const notImage = await fetch(base + "/api/store-info/logo", {
    method: "POST",
    headers: { cookie, "content-type": "text/plain" },
    body: "not an image",
  });
  check("يرفض رفع نوع غير مسموح", notImage.status === 400 || notImage.status === 415, `status=${notImage.status}`);

  // رفع صورة PNG صغيرة (1×1) — محتوى صورة غير صالح للعرض لكن بايتاته صحيحة
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const logoUpload = await fetch(base + "/api/store-info/logo", {
    method: "POST",
    headers: { cookie, "content-type": "image/png" },
    body: png,
  });
  const logoJson = await logoUpload.json().catch(() => null);
  check("رفع الشعار ينجح ويعيد مساراً و رابطاً",
    logoUpload.status === 200 && Boolean(logoJson?.data?.logoPath) && Boolean(logoJson?.data?.url),
    logoJson?.data?.logoPath ?? logoJson?.error ?? "");

  if (logoJson?.data?.logoPath) {
    const urlCheck = await fetch(logoJson.data.url);
    check("رابط الشعار العام يعمل", urlCheck.ok, `status=${urlCheck.status}`);

    const saveLogo = await fetch(base + "/api/store-info", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...info, logoPath: logoJson.data.logoPath }),
    });
    check("حفظ مسار الشعار", saveLogo.status === 200);

    const after = await (await get("/api/store-info")).json();
    check("المسار محفوظ فعلاً",
      after?.data?.info?.logoPath === logoJson.data.logoPath, after?.data?.info?.logoPath);
  }

  // رفض ملف صورة يتجاوز 2 ميجابايت
  const big = Buffer.alloc(2 * 1024 * 1024 + 1024, 0x89);
  big.write("\x89PNG\r\n\x1a\n", 0, "binary");
  const tooBig = await fetch(base + "/api/store-info/logo", {
    method: "POST",
    headers: { cookie, "content-type": "image/png" },
    body: big,
  });
  check("يرفض صورة أكبر من 2MB", tooBig.status === 413 || tooBig.status === 400, `status=${tooBig.status}`);

  // صور المنتجات: صفحة المنتجات + رفع صورة
  const prodPage = await get("/products");
  const prodHtml = await prodPage.text();
  check("/products يفتح", prodPage.status === 200, `status=${prodPage.status}`);
  check("نموذج المنتج يحتوي حقل الصورة الرئيسية", prodHtml.includes("product-image-input"));
  check("نموذج المنتج يذكر الصور لكل لون", prodHtml.includes("صور هذا اللون") || prodHtml.includes("صور"));

  const prodJson = await (await get("/api/products")).json();
  check("GET /api/products يعيد storagePublicBase",
    Boolean(prodJson?.data?.storagePublicBase), prodJson?.data?.storagePublicBase ?? "");

  const prodUpload = await fetch(base + "/api/products/upload?scope=color", {
    method: "POST",
    headers: { cookie, "content-type": "image/png" },
    body: png,
  });
  const prodUploadJson = await prodUpload.json().catch(() => null);
  check("رفع صورة منتج ينجح", prodUpload.status === 200 && Boolean(prodUploadJson?.data?.path),
    prodUploadJson?.data?.path ?? prodUploadJson?.error ?? "");

  if (prodUploadJson?.data?.path) {
    const img = await fetch(prodUploadJson.data.url);
    check("رابط صورة المنتج العام يعمل", img.ok, `status=${img.status}`);
  }

  const summary = results.filter((r) => !r.passed);
  console.log(`\n── ${results.length - summary.length}/${results.length} نجحت ──`);
  if (summary.length) {
    console.log("فشل:");
    summary.forEach((r) => console.log(`  - ${r.name} ${r.detail}`));
    process.exitCode = 1;
  }
  process.exit(summary.length ? 1 : 0);
}

main().catch((error) => {
  console.error("VERIFY ERROR:", error?.message || error);
  process.exit(1);
});
