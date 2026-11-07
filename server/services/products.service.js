import { sbDelete, sbInsert, sbRpc, sbSelect, sbUpdate } from "../supabase.js";
import { nextProductSlug } from "./slug.service.js";
import {
  ARTWORK_ORDER,
  BADGE_ORDER,
  GENDER_ORDER,
} from "../../public/assets/js/core/domain.js";

/**
 * كل ما يخص المنتجات: قراءة، تحقق، إنشاء/تعديل/حذف.
 *
 * التحقق هنا نسخة مطابقة لقواعد متجر Next (`src/lib/product-write.ts`)،
 * حتى لا يقبل المدير منتجاً يرفضه المتجر أو العكس.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_COLORS = 20;
/** أقصى عدد صور لكل لون — نفس الحد المعروض في واجهة المتجر. */
const MAX_IMAGES_PER_COLOR = 5;
const MAX_PATH_LENGTH = 300;

const str = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * مسار صورة آمن داخل bucket `product-images`.
 * نرفض ما قد يخرج عن الـ bucket أو يُفسَّر كرابط مطلق من العميل.
 */
function safeImagePath(value) {
  const text = str(value);
  if (!text || text.length > MAX_PATH_LENGTH) return "";
  if (text.includes("..")) return "";
  if (text.includes("\\")) return "";
  if (text.startsWith("/")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return "";
  if (!/^[A-Za-z0-9_./-]+$/.test(text)) return "";
  return text;
}

/**
 * خريطة صور الألوان: { "اسم اللون": ["مسار", …] } بحد أقصى 5 لكل لون.
 * `allowedNames` (إن مُرّرت) تقصر المفاتيح على ألوان المنتج الفعلية،
 * فلا تُحفظ صور لألوان محذوفة.
 */
function parseColorImages(value, allowedNames) {
  if (value === null || value === undefined || value === "") return { colorImages: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "صيغة صور الألوان غير صحيحة" };
  }

  const allowed = Array.isArray(allowedNames)
    ? new Set(allowedNames.map((name) => str(name)))
    : null;

  const out = {};

  for (const [rawName, rawList] of Object.entries(value)) {
    const name = str(rawName);
    if (!name) continue;
    // لون غير موجود في المنتج — تجاهل بدل حفظ صور يتيمة.
    if (allowed && !allowed.has(name)) continue;

    if (!Array.isArray(rawList)) {
      return { error: `صور اللون «${name}» يجب أن تكون قائمة` };
    }
    if (rawList.length > MAX_IMAGES_PER_COLOR) {
      return { error: `الحد الأقصى ${MAX_IMAGES_PER_COLOR} صور للون «${name}»` };
    }

    const paths = [];
    for (const rawPath of rawList) {
      const path = safeImagePath(rawPath);
      if (!path) return { error: `مسار صورة غير صالح للون «${name}»` };
      if (!paths.includes(path)) paths.push(path);
    }

    if (paths.length) out[name] = paths;
  }

  return { colorImages: out };
}

/**
 * الألوان ومخزون كل لون.
 * يعيد { colors } أو { error } — والمجموع يُحسب لاحقاً ليكون مخزون المنتج.
 */
function parseColors(value) {
  if (!Array.isArray(value)) return { error: "صيغة الألوان غير صحيحة" };
  if (value.length > MAX_COLORS) {
    return { error: `الحد الأقصى ${MAX_COLORS} لوناً للمنتج` };
  }

  const colors = [];
  const seen = new Set();

  for (const raw of value) {
    const name = str(raw?.name);
    const hex = str(raw?.hex).toLowerCase();

    if (!name) return { error: "اسم اللون مطلوب" };
    if (name.length > 40) return { error: "اسم اللون طويل جداً (40 حرفاً كحد أقصى)" };

    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `اللون «${name}» مكرر — استخدم اسماً مختلفاً` };
    seen.add(key);

    if (!HEX_RE.test(hex)) {
      return { error: `لون «${name}» يجب أن يكون بصيغة #RRGGBB` };
    }

    const stock = Number(raw?.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
      return { error: `مخزون اللون «${name}» يجب أن يكون رقماً صحيحاً غير سالب` };
    }

    colors.push({ name, hex, stock });
  }

  return { colors };
}


/** يقبل مصفوفة أو نصاً مفصولاً بفواصل/أسطر. */
function parseFeatures(value) {
  if (value === undefined) return null;
  const list = Array.isArray(value)
    ? value.map((item) => String(item).trim())
    : String(value)
        .split(/[,،\n]/)
        .map((item) => item.trim());
  return list.filter(Boolean).slice(0, 10).map((item) => item.slice(0, 120));
}

/** صف القاعدة → شكل ثابت للواجهة. */
export function mapProduct(row) {
  const compareAt = row?.compare_at;
  return {
    id: String(row?.id ?? ""),
    slug: String(row?.slug ?? ""),
    name: String(row?.name ?? ""),
    subtitle: String(row?.subtitle ?? ""),
    category: String(row?.category ?? ""),
    gender: row?.gender ?? "unisex",
    price: Number(row?.price ?? 0),
    compareAt: compareAt === null || compareAt === undefined ? null : Number(compareAt),
    rating: Number(row?.rating ?? 0),
    reviews: Number(row?.reviews ?? 0),
    badge: row?.badge ?? null,
    artwork: row?.artwork ?? "perfume",
    tone: String(row?.tone ?? "#6d4a33"),
    description: String(row?.description ?? ""),
    features: Array.isArray(row?.features) ? row.features : [],
    colors: Array.isArray(row?.colors)
      ? row.colors
          .filter((color) => color && color.name && color.hex)
          .map((color) => {
            const item = { name: String(color.name), hex: String(color.hex) };
            if (color.stock !== undefined && color.stock !== null) {
              const stock = Number(color.stock);
              if (Number.isFinite(stock)) item.stock = stock;
            }
            return item;
          })
      : [],
    stock: Number(row?.stock ?? 0),
    active: row?.active !== false,
    // صور المنتج: صورة رئيسية + حتى 5 صور لكل لون (مفاتيح = أسماء الألوان).
    imagePath: safeImagePath(row?.image_path),
    colorImages: parseColorImages(row?.color_images).colorImages ?? {},
    sortOrder: Number(row?.sort_order ?? 0),
    createdAt: row?.created_at ? String(row.created_at) : "",
    updatedAt: row?.updated_at ? String(row.updated_at) : "",
  };
}

/** كل التصنيفات المتاحة للمنتج. */
export async function listCategories() {
  const rows = await sbSelect(
    "categories",
    "select=slug,name,parent,sort_order&order=sort_order.asc"
  );

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    slug: String(row?.slug ?? ""),
    name: String(row?.name ?? ""),
    parent: row?.parent ? String(row.parent) : null,
  }));
}

/**
 * قائمة المنتجات + إحصاءات سريعة.
 * الفلاتر اختيارية، والبحث يشمل الاسم والوصف المختصر.
 */
export async function listProducts({ query = "", category = "", visibility = "", stock = "" } = {}) {
  const filters = [];

  if (category) {
    filters.push(`category=eq.${encodeURIComponent(category)}`);
  }
  if (visibility === "active") filters.push("active=eq.true");
  if (visibility === "hidden") filters.push("active=eq.false");
  if (stock === "out") filters.push("stock=eq.0");
  if (stock === "low") filters.push("stock=lte.5&stock=gt.0");

  const term = String(query ?? "").trim().slice(0, 60);
  if (term) {
    const encoded = encodeURIComponent(term.replace(/[,()]/g, " "));
    const pattern = `*${encoded}*`;
    filters.push(`or=(name.ilike.${pattern},subtitle.ilike.${pattern})`);
  }

  const queryString = [
    "select=*",
    ...filters,
    "order=sort_order.asc.nullslast,created_at.asc",
  ].join("&");

  const [rows, all] = await Promise.all([
    sbSelect("products", queryString),
    sbSelect("products", "select=id,slug,active,stock"),
  ]);

  const products = Array.isArray(rows) ? rows.map(mapProduct) : [];
  const safeAll = Array.isArray(all) ? all : [];

  return {
    products,
    stats: {
      total: safeAll.length,
      active: safeAll.filter((row) => row.active !== false).length,
      hidden: safeAll.filter((row) => row.active === false).length,
      outOfStock: safeAll.filter((row) => Number(row.stock ?? 0) === 0).length,
    },
  };
}

export async function getProduct(id) {
  const rows = await sbSelect(
    "products",
    `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? mapProduct(rows[0]) : null;
}

/**
 * تحقق وتحويل مدخلات المنتج.
 * @param body جسم الطلب
 * @param opts.partial في التعديل الجزئي: الحقول الغائبة تُترك كما هي
 * @param opts.categories قائمة slugs المتاحة
 */
export function parseProductInput(
  body,
  { partial = false, categories = [], allowedColorNames = null } = {}
) {
  const input = (body ?? {}) ?? {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const row = {};

  if (!partial || has("name")) {
    const name = str(input.name);
    if (name.length < 2) return { ok: false, error: "اسم المنتج مطلوب (حرفان على الأقل)" };
    if (name.length > 120) return { ok: false, error: "اسم المنتج طويل جداً" };
    row.name = name;
  }

  if (!partial || has("category")) {
    const category = str(input.category);
    if (!categories.includes(category)) return { ok: false, error: "التصنيف غير معروف" };
    row.category = category;
  }

  if (!partial || has("gender")) {
    const gender = str(input.gender);
    if (!GENDER_ORDER.includes(gender)) {
      return { ok: false, error: "الجنس يجب أن يكون men أو women أو unisex" };
    }
    row.gender = gender;
  }

  if (!partial || has("price")) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      return { ok: false, error: "السعر غير صحيح" };
    }
    row.price = Math.round(price * 100) / 100;
  }

  if (!partial || has("compareAt")) {
    if (input.compareAt === null || input.compareAt === "" || input.compareAt === undefined) {
      row.compare_at = null;
    } else {
      const compareAt = Number(input.compareAt);
      if (!Number.isFinite(compareAt) || compareAt < 0 || compareAt > 1_000_000) {
        return { ok: false, error: "السعر قبل الخصم غير صحيح" };
      }
      row.compare_at = Math.round(compareAt * 100) / 100;
    }
  }

  // الألوان: إن أُرسلت، يصبح مجموع مخزونها هو مخزون المنتج (ويتجاهل stock اليدوي).
  let colorTotal = null;
  if (!partial || has("colors")) {
    if (input.colors === null || input.colors === undefined || input.colors === "") {
      row.colors = null;
    } else {
      const parsedColors = parseColors(input.colors);
      if (parsedColors.error) return { ok: false, error: parsedColors.error };

      if (parsedColors.colors.length === 0) {
        row.colors = null;
      } else {
        row.colors = parsedColors.colors;
        colorTotal = parsedColors.colors.reduce((sum, color) => sum + color.stock, 0);
      }
    }
  }

  if (colorTotal !== null) {
    row.stock = colorTotal;
  } else if (!partial || has("stock")) {
    const stock = Number(input.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
      return { ok: false, error: "المخزون يجب أن يكون رقماً صحيحاً غير سالب" };
    }
    row.stock = stock;
  }

  // ── صور المنتج ──────────────────────────────────────────
  // الصورة الرئيسية اختيارية؛ القيمة الفارغة تمسحها.
  if (!partial || has("imagePath")) {
    const raw = str(input.imagePath);
    if (!raw) {
      row.image_path = null;
    } else {
      const path = safeImagePath(raw);
      if (!path) return { ok: false, error: "مسار الصورة الرئيسية غير صالح" };
      row.image_path = path;
    }
  }

  // صور الألوان: نُبقي فقط مفاتيح الألوان المحفوظة فعلاً.
  // `allowedColorNames` يأتي من المُنادي (أسماء الألوان المرسلة أو الحالية)،
  // لأن هذه الدالة متزامنة ولا تصل إلى القاعدة.
  if (!partial || has("colorImages")) {
    const allowedNames = Array.isArray(row.colors)
      ? row.colors.map((color) => color.name)
      : Array.isArray(allowedColorNames)
        ? allowedColorNames
        : null;

    const parsed = parseColorImages(input.colorImages, allowedNames);
    if (parsed.error) return { ok: false, error: parsed.error };
    row.color_images = parsed.colorImages;
  }

  if (!partial || has("badge")) {
    const badge = str(input.badge);
    if (!badge) row.badge = null;
    else if (!BADGE_ORDER.includes(badge)) return { ok: false, error: "الشارة غير معروفة" };
    else row.badge = badge;
  }

  if (!partial || has("artwork")) {
    const artwork = str(input.artwork);
    if (!ARTWORK_ORDER.includes(artwork)) return { ok: false, error: "نوع الرسم غير معروف" };
    row.artwork = artwork;
  }

  if (!partial || has("tone")) {
    const tone = str(input.tone);
    if (!HEX_RE.test(tone)) return { ok: false, error: "اللون يجب أن يكون بصيغة #RRGGBB" };
    row.tone = tone;
  }

  if (!partial || has("subtitle")) {
    row.subtitle = str(input.subtitle).slice(0, 120);
  }

  if (!partial || has("description")) {
    const description = str(input.description);
    if (description.length > 2000) return { ok: false, error: "الوصف أطول من الحد المسموح" };
    row.description = description;
  }

  if (!partial || has("features")) {
    row.features = parseFeatures(input.features) ?? [];
  }

  if (!partial || has("active")) {
    row.active = input.active === undefined ? true : Boolean(input.active);
  }

  return { ok: true, row };
}

export async function createProduct(body) {
  const categories = await listCategories();
  const parsed = parseProductInput(body, {
    categories: categories.map((item) => item.slug),
  });

  if (!parsed.ok) return parsed;

  // الرابط ورقمه يُولَّدان على الخادم داخل التصنيف المختار.
  const allocation = await nextProductSlug(parsed.row.category);

  // المنتج الجديد يذهب آخر القائمة بدل أن يقفز إلى الأعلى.
  let sortOrder = 0;
  try {
    const last = await sbSelect(
      "products",
      "select=sort_order&order=sort_order.desc.nullslast&limit=1"
    );
    sortOrder = Number(last?.[0]?.sort_order ?? 0) + 1;
  } catch {
    sortOrder = 0;
  }

  const id = `p-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const rows = await sbInsert("products", [
    {
      id,
      ...parsed.row,
      slug: allocation.slug,
      seq: allocation.seq,
      sort_order: sortOrder,
    },
  ]);

  return { ok: true, product: mapProduct(rows?.[0]) };
}

export async function updateProduct(id, body) {
  const categories = await listCategories();

  // نقرأ المنتج الحالي أولاً: صور الألوان تحتاج أسماء ألوانه عند تعديل
  // لا يمسّ قائمة الألوان (وإلا رفضنا صوراً صحيحة أو حفظنا مفاتيح يتيمة).
  const currentRows = await sbSelect(
    "products",
    `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  const current = Array.isArray(currentRows) ? currentRows[0] : null;

  if (!current) {
    return { ok: false, status: 404, error: "المنتج غير موجود" };
  }

  const currentColorNames = Array.isArray(current.colors)
    ? current.colors.filter((c) => c?.name).map((c) => String(c.name))
    : [];

  const parsed = parseProductInput(body, {
    partial: true,
    categories: categories.map((item) => item.slug),
    allowedColorNames: currentColorNames,
  });

  if (!parsed.ok) return parsed;

  const { category: nextCategory, ...patch } = parsed.row;
  if (!nextCategory && !Object.keys(patch).length) {
    return { ok: false, status: 400, error: "لا يوجد ما يُحدَّث" };
  }

  const moving = Boolean(nextCategory) && nextCategory !== current.category;

  // تغيير التصنيف: تُحدَّث بقية الحقول أولاً، ثم تنقل الدالة الذرّية
  // المنتج وتصرف له رابطاً جديداً وتُسجّل القديم للتحويل في المتجر.
  if (Object.keys(patch).length) {
    await sbUpdate("products", `id=eq.${encodeURIComponent(id)}`, patch);
  }

  if (moving) {
    await sbRpc("stoor_move_product", {
      p_product_id: id,
      p_new_category: nextCategory,
    });
  }

  return { ok: true, product: await getProduct(id) };
}

export async function deleteProduct(id) {
  const rows = await sbDelete("products", `id=eq.${encodeURIComponent(id)}`);
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 404, error: "المنتج غير موجود" };
  }
  return { ok: true };
}
