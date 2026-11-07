import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import { ok, fail, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { getStoreInfo, saveStoreInfo } from "../services/store-info.service.js";
import { notifyStoreRevalidate } from "../services/orders.service.js";
import {
  sbUpsert,
  sbUploadObject,
  sbRemoveObject,
  sbPublicUrl,
} from "../supabase.js";

const router = Router();

const BUCKET = "store-assets";
const SETTINGS_KEY = "store_info";
const MAX_BYTES = 2 * 1024 * 1024; // 2097152 — مطابق لحد الـ bucket

/** الأنواع المسموحة ← امتداد الملف الذي نُولّده على الخادم. */
const EXT_BY_MIME = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
});
const ALLOWED_MIME = Object.keys(EXT_BY_MIME);

// express.json العام (100kb) يطابق application/json فقط، فيترك جسم الصورة كما هو،
// وهذا الـ raw المحلي يقرأه كـ Buffer. المسار يُولَّد هنا ولا يُقبل من العميل أبداً.
const rawImage = express.raw({ type: ALLOWED_MIME, limit: "3mb" });

/** يكشف النوع الحقيقي من البايتات — لرفض أي ملف مُسمّى بصورة خاطئة. */
function detectMime(buffer) {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer.toString("ascii", 1, 4) === "PNG"
  ) {
    return "image/png"; // \x89PNG
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg"; // FFD8FF
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"; // RIFF....WEBP
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return "image/avif"; // صندوق ftyp
  }
  return null;
}

router.get("/store-info", requireAdmin, route(async (req, res) => {
  const info = await getStoreInfo();
  // يُمرَّر للقالب لمعاينة الشعار الحالي عند فتح الصفحة (قبل تحميل JS).
  const logoUrl = info.logoPath ? sbPublicUrl(BUCKET, info.logoPath) : "";

  res.render("store-info", {
    title: "معلومات المتجر",
    active: "store-info",
    pageScript: "store-info",
    pageCss: "store-info",
    logoUrl: logoUrl || "",
  });
}));

router.get(
  "/api/store-info",
  requireAdmin,
  route(async (req, res) => {
    const info = await getStoreInfo();
    // رابط عام للمعاينة — الواجهة تحتاج رابطاً لا مساراً لتضعه في <img>.
    const logoUrl = info.logoPath ? sbPublicUrl(BUCKET, info.logoPath) : "";
    return ok(res, { info, logoUrl: logoUrl || "" });
  })
);

router.put(
  "/api/store-info",
  requireAdmin,
  route(async (req, res) => {
    const result = await saveStoreInfo(req.body ?? {});
    if (!result.ok) return fail(res, 400, result.error);

    await sbUpsert("settings", [{ key: SETTINGS_KEY, value: result.value }], "key");
    await notifyStoreRevalidate();
    return ok(res, { info: result.value });
  })
);

router.post(
  "/api/store-info/logo",
  requireAdmin,
  rawImage,
  route(async (req, res) => {
    const contentType = String(req.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_MIME.includes(contentType)) {
      return fail(res, 400, "نوع الصورة غير مدعوم — PNG أو JPEG أو WebP أو AVIF فقط");
    }

    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return fail(res, 400, "لم يتم استقبال ملف صورة صالح");
    }
    if (buffer.length > MAX_BYTES) {
      return fail(res, 400, "حجم الشعار يتجاوز الحد المسموح (2 ميغابايت)");
    }
    if (detectMime(buffer) !== contentType) {
      return fail(res, 400, "محتوى الملف لا يطابق نوعه — ملف مُسمّى بصورة خاطئة");
    }

    const objectPath = `logo/${randomUUID()}.${EXT_BY_MIME[contentType]}`;
    await sbUploadObject(BUCKET, objectPath, buffer, contentType);
    const url = sbPublicUrl(BUCKET, objectPath);

    return ok(res, { logoPath: objectPath, url });
  })
);

router.delete(
  "/api/store-info/logo",
  requireAdmin,
  route(async (req, res) => {
    const info = await getStoreInfo();
    if (info.logoPath) {
      await sbRemoveObject(BUCKET, info.logoPath);
    }

    const cleared = { ...info, logoPath: "" };
    await sbUpsert("settings", [{ key: SETTINGS_KEY, value: cleared }], "key");
    await notifyStoreRevalidate();
    return ok(res, { info: cleared });
  })
);

export default router;
