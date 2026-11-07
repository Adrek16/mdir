import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
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
 * تطبيق لوحة المدير — Express + EJS.
 *
 * يُستخدم في حالتين:
 *  - محلياً: server/index.js يستورد app ثم يستدعي listen.
 *  - على Netlify: netlify/functions/api.mjs يغلّفه بـ serverless-http.
 *
 * لا تُبنى الصفحات مسبقاً؛ تُرسَم على الخادم عند كل طلب.
 */

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

/**
 * هل نعمل داخل دالة سيرفرلس؟ (Netlify Functions تعمل على AWS Lambda)
 * نعتمد على إشارة البيئة، ومعها فحص نظام الملفات كاحتياط: داخل حزمة
 * الدالة لا يوجد مجلد `views` بجوار `server/` الأصلي.
 */
const hasLocalProjectFiles = existsSync(path.join(projectRoot, "views"));
const isServerless =
  Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.NETLIFY_DEV ||
      process.env.NETLIFY
  ) || !hasLocalProjectFiles;

/** بصمة إصدار للملفات الثابتة — تُبدَّل عند كل إقلاع لتجاوز كاش قديم. */
const assetVersion = Date.now().toString(36);

/**
 * محلياً نستخدم `/assets/v/<version>` لكسر الكاش. على Netlify تُخدَم الأصول
 * من مجلد النشر (`publish = "public"`) مباشرة عبر CDN، وبصمة تتغير مع كل
 * برودة تشغيل للدالة ستُنتج روابط مكسورة؛ لذا نثبّت المسار على `/assets`.
 */
const assetBase =
  process.env.ASSET_BASE || (isServerless ? "/assets" : `/assets/v/${assetVersion}`);

/**
 * قوالب EJS تُقرأ من القرص وقت التنفيذ. داخل حزمة الدالة لا يوجد `server/`
 * بالمسار الأصلي، لذا نجرّب عدة مواقع ونختار أول موجود منها.
 * netlify.toml يضمن نسخ `views/**` داخل الحزمة.
 */
const viewsCandidates = [
  process.env.VIEWS_DIR,
  path.join(projectRoot, "views"),
  path.join(process.cwd(), "views"),
  path.join(root, "views"),
].filter(Boolean);
const viewsDir =
  viewsCandidates.find((candidate) => existsSync(candidate)) || viewsCandidates[1];

const app = express();

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", viewsDir);

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
// على Netlify يتكبّل CDN بهذه الملفات، فلا تصل أصلاً إلى الدالة.
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

export { app };
