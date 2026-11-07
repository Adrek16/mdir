import { sbPublicUrl, sbUploadObject } from "../supabase.js";

/**
 * رفع صور المنتجات إلى bucket `product-images`.
 *
 * الخادم هو من يولّد المسار ويتحقق من المحتوى — لا يُقبل أي مسار أو اسم
 * من العميل. الدالة مشتركة كي تُستخدم من أي مسار يحتاج رفع صورة لاحقاً.
 */

const EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** الأنواع المسموح بها في bucket التخزين — تُستخدم أيضاً في `express.raw`. */
export const IMAGE_MIME_TYPES = Object.keys(EXT_BY_MIME);

/** 5 ميغابايت — مطابق لحد bucket التخزين. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const isPng = (b) =>
  b.length >= 8 &&
  b[0] === 0x89 &&
  b[1] === 0x50 &&
  b[2] === 0x4e &&
  b[3] === 0x47 &&
  b[4] === 0x0d &&
  b[5] === 0x0a &&
  b[6] === 0x1a &&
  b[7] === 0x0a;

const isJpeg = (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const isWebp = (b) =>
  b.length >= 12 &&
  b.toString("ascii", 0, 4) === "RIFF" &&
  b.toString("ascii", 8, 12) === "WEBP";

/** AVIF/HEIF عائلة ISO-BMFF: صندوق ftyp يحمل العلامة avif/avis. */
const isAvif = (b) => {
  if (b.length < 12 || b.toString("ascii", 4, 8) !== "ftyp") return false;
  const boxSize = b.readUInt32BE(0);
  const end = Math.min(b.length, boxSize > 0 ? boxSize : b.length);
  const brands = b.toString("ascii", 8, Math.min(end, 8 + 64));
  return /avif|avis/.test(brands);
};

/** يكتشف النوع من البايتات نفسها لا من الترويسة التي قد تُزوَّر. */
function detectMime(bytes) {
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isWebp(bytes)) return "image/webp";
  if (isAvif(bytes)) return "image/avif";
  return null;
}

/**
 * يتحقق من ملف مرفوع ويولّد مساراً آمناً على الخادم.
 * يعيد { ok:true, mime, path } أو { ok:false, status, error } بالعربية.
 */
export function prepareImageUpload(bytes, contentType, scope = "main") {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, status: 400, error: "الملف فارغ أو غير صالح" };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: "حجم الصورة يتجاوز 5 ميغابايت" };
  }

  const declared = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!EXT_BY_MIME[declared]) {
    return { ok: false, status: 400, error: "نوع الصورة غير مدعوم (PNG أو JPEG أو WebP أو AVIF فقط)" };
  }

  const detected = detectMime(bytes);
  if (!detected) {
    return { ok: false, status: 400, error: "محتوى الملف لا يطابق صورة صالحة" };
  }
  if (detected !== declared) {
    return { ok: false, status: 400, error: "نوع الصورة لا يطابق محتوى الملف" };
  }

  // ?scope=main|color informative فقط — العميل لا يختار المسار أبداً.
  const label = scope === "color" ? "color" : "main";
  const path = `products/${crypto.randomUUID()}/${label}-${crypto.randomUUID()}.${EXT_BY_MIME[detected]}`;

  return { ok: true, mime: detected, path };
}

/** يرفع بايتات مُتحقَّق منها ويعيد { path, url }. */
export async function uploadImage(bytes, mime, path) {
  const url = await sbUploadObject("product-images", path, bytes, mime);
  return { path, url: url || sbPublicUrl("product-images", path) };
}
