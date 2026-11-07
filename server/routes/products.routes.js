import express, { Router } from "express";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { notifyStoreRevalidate } from "../services/orders.service.js";
import { sbPublicUrl } from "../supabase.js";
import {
  IMAGE_MIME_TYPES,
  prepareImageUpload,
  uploadImage,
} from "../services/upload.service.js";
import {
  ARTWORK_LABEL,
  ARTWORK_ORDER,
  BADGE_LABEL,
  BADGE_ORDER,
  GENDER_LABEL,
  GENDER_ORDER,
} from "../../public/assets/js/core/domain.js";
import {
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  updateProduct,
} from "../services/products.service.js";

const router = Router();

const toOptions = (values, labels) =>
  values.map((value) => ({ value, label: labels[value] }));

const genderOptions = toOptions(GENDER_ORDER, GENDER_LABEL);
const badgeOptions = toOptions(BADGE_ORDER, BADGE_LABEL);
const artworkOptions = toOptions(ARTWORK_ORDER, ARTWORK_LABEL);

// أساس الروابط العامة لكائنات bucket الصور — يُرسل للواجهة لتبني منه
// معاينات للمسارات المخزّنة (image_path / color_images) دون كشف المفتاح.
const publicSample = sbPublicUrl("product-images", "__base__");
const STORAGE_PUBLIC_BASE = publicSample
  ? publicSample.replace(/\/__base__$/, "")
  : "";

// مُحلِّل بايتات محلّي للمسار فقط: json العام (100kb) لا يلمس الصور،
// وهذا يقرأ الجسم كـ Buffer بحدّ 6mb قبل فحصنا الخاص (5mb).
const rawImage = express.raw({ type: IMAGE_MIME_TYPES, limit: "6mb" });

const imageUploadError = (error, req, res, next) => {
  if (!error) return next();
  const tooLarge = error.type === "entity.too.large" || error.status === 413;
  return fail(
    res,
    tooLarge ? 413 : 400,
    tooLarge ? "حجم الصورة يتجاوز 5 ميغابايت" : "تعذّر قراءة ملف الصورة"
  );
};

router.get(
  "/products",
  requireAdmin,
  route(async (req, res) => {
    res.render("products", {
      title: "المنتجات",
      active: "products",
      pageScript: "products",
      categories: await listCategories(),
      genderOptions,
      badgeOptions,
      artworkOptions,
    });
  })
);

router.get(
  "/api/products",
  requireAdmin,
  route(async (req, res) => {
    const data = await listProducts({
      query: req.query.query,
      category: req.query.category,
      visibility: req.query.visibility,
      stock: req.query.stock,
    });

    return ok(res, {
      ...data,
      categories: await listCategories(),
      storagePublicBase: STORAGE_PUBLIC_BASE,
    });
  })
);

// رفع صورة واحدة: المسار يُولَّد على الخادم، والعميل يأخذ { path, url }
// ليحفظ المسار في image_path / color_images عند حفظ المنتج.
router.post(
  "/api/products/upload",
  requireAdmin,
  rawImage,
  imageUploadError,
  route(async (req, res) => {
    const contentType = String(req.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!IMAGE_MIME_TYPES.includes(contentType)) {
      return fail(res, 400, "نوع الصورة غير مدعوم (PNG أو JPEG أو WebP أو AVIF فقط)");
    }

    const bytes = req.body;
    const prepared = prepareImageUpload(bytes, contentType, req.query.scope);
    if (!prepared.ok) return fail(res, prepared.status, prepared.error);

    const result = await uploadImage(bytes, prepared.mime, prepared.path);
    return ok(res, result);
  })
);

router.post(
  "/api/products",
  requireAdmin,
  route(async (req, res) => {
    const result = await createProduct(req.body ?? {});
    if (!result.ok) return fail(res, result.status || 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { product: result.product }, 201);
  })
);

router.patch(
  "/api/products/:id",
  requireAdmin,
  route(async (req, res) => {
    const result = await updateProduct(req.params.id, req.body ?? {});
    if (!result.ok) return fail(res, result.status || 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { product: result.product });
  })
);

router.delete(
  "/api/products/:id",
  requireAdmin,
  route(async (req, res) => {
    const result = await deleteProduct(req.params.id);
    if (!result.ok) return fail(res, result.status || 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { deleted: true });
  })
);

export default router;
