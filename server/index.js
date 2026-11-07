import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { fail } from "./http.js";
import { readSession } from "./middleware/require-admin.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import productsRoutes from "./routes/products.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import customersRoutes from "./routes/customers.routes.js";
import reviewsRoutes from "./routes/reviews.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import storeInfoRoutes from "./routes/store-info.routes.js";
import { pendingReviewsCount } from "./services/reviews.service.js";

/**
 * خادم لوحة المدير — محلي فقط.
 *
 * Express + EJS: الصفحات تُبنى على الخادم، فلا تُرسل واجهة الإدارة
 * لزائر غير مسجّل، ولا يحتاج المشروع خطوة بناء.
 */

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

/** بصمة إصدار للملفات الثابتة — تُبدَّل عند كل إقلاع لتجاوز كاش قديم. */
const assetVersion = Date.now().toString(36);

const app = express();

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(projectRoot, "views"));

// ── ترويسات أساسية ─────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // صور الشعار والمنتجات تُعرض من Supabase Storage العام.
      `img-src 'self' data: blob: ${new URL(env.supabaseUrl).origin}`,
      "font-src 'self'",
      "style-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  next();
});

// ── الملفات الثابتة ────────────────────────────────────────
// كل إقلاع يبني مساراً جديداً `/assets/v/<version>/…`، فتُتجاوز أي نسخة
// قديمة في الكاش، وتبقى الواردات النسبية داخل وحدات JS تعمل كما هي.
const assetBase = `/assets/v/${assetVersion}`;
const staticOptions = {
  maxAge: env.isProduction ? "365d" : 0,
  immutable: env.isProduction,
  etag: true,
};

app.use(
  assetBase,
  express.static(path.join(projectRoot, "public", "assets"), staticOptions)
);
app.use("/fonts", express.static(path.join(projectRoot, "public", "fonts"), staticOptions));

// ── قراءة JSON ─────────────────────────────────────────────
app.use(express.json({ limit: "100kb" }));

// ── سياق مشترك لكل الصفحات ─────────────────────────────────
app.use(async (req, res, next) => {
  const session = readSession(req);

  res.locals.admin = session;
  res.locals.currentPath = req.path;
  res.locals.storeUrl = env.storeUrl;
  res.locals.appName = "ستور";
  res.locals.appTagline = "لوحة المدير";
  res.locals.assetBase = assetBase;
  res.locals.pendingReviews = 0;

  // عدّاد التقييمات بانتظار المراجعة — لصفحات HTML فقط، وبعد الدخول.
  if (session && !req.path.startsWith("/api/")) {
    try {
      res.locals.pendingReviews = await pendingReviewsCount();
    } catch {
      res.locals.pendingReviews = 0;
    }
  }

  // لا نخزّن صفحات الإدارة ولا ردودها في كاش المتصفح.
  res.setHeader("Cache-Control", "no-store");

  next();
});

// ── الصفحات والـ API ──────────────────────────────────────
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(ordersRoutes);
app.use(productsRoutes);
app.use(categoriesRoutes);
app.use(customersRoutes);
app.use(reviewsRoutes);
app.use(reportsRoutes);
app.use(settingsRoutes);
app.use(storeInfoRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return fail(res, 404, "المسار غير موجود");
  }

  return res.status(404).render("error", {
    title: "الصفحة غير موجودة",
    status: 404,
    message: "الرابط الذي تحاول فتحه غير موجود في لوحة المدير.",
  });
});

// ── معالج الأخطاء ─────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error("[server]", error);

  if (res.headersSent) return;

  if (req.path.startsWith("/api/")) {
    return fail(res, 500, "حدث خطأ غير متوقع — راجع سجل الخادم");
  }

  return res.status(500).render("error", {
    title: "خطأ غير متوقع",
    status: 500,
    message: "تعذّر إكمال العملية. راجع نافذة الخادم لمعرفة السبب.",
  });
});

app.listen(env.port, env.host, () => {
  console.log(`\n  لوحة مدير ستور تعمل على http://${env.host}:${env.port}`);
  console.log(`  المتجر: ${env.storeUrl}\n`);
});
