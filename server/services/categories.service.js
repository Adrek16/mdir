import { sbDelete, sbInsert, sbRpc, sbSelect, sbUpdate } from "../supabase.js";
import { nextCategorySlug } from "./slug.service.js";
import {
  CATEGORY_PARENT_ORDER,
  GENDER_ORDER,
} from "../../public/assets/js/core/domain.js";

/**
 * كل ما يخص التصنيفات: قراءة مع عدد المنتجات، تحقق، وإنشاء/تعديل/حذف.
 *
 * الرابط (slug) لا يُدخل يدوياً: يُولَّد تلقائياً على الخادم من القسم
 * الرئيسي + رقم متسلسل داخل القسم (perfumes-1، accessories-4، general-1).
 *
 * الحذف محمي على مستويين:
 *  - قاعدة البيانات (products.category → on delete restrict).
 *  - هذا الملف: رسالة عربية واضحة بدل خطأ قاعدة بيانات خام.
 */

const str = (value) => (typeof value === "string" ? value.trim() : "");

export function mapCategory(row) {
  return {
    slug: String(row?.slug ?? ""),
    name: String(row?.name ?? ""),
    nameEn: String(row?.name_en ?? ""),
    parent: row?.parent ? String(row.parent) : null,
    gender: row?.gender ? String(row.gender) : null,
    blurb: String(row?.blurb ?? ""),
    sortOrder: Number(row?.sort_order ?? 0),
    createdAt: row?.created_at ? String(row.created_at) : "",
  };
}

/** قائمة التصنيفات + عدد المنتجات في كل تصنيف. */
export async function listCategoriesWithCounts() {
  const [rows, products] = await Promise.all([
    sbSelect("categories", "select=*&order=sort_order.asc,created_at.asc"),
    sbSelect("products", "select=id,category"),
  ]);

  const counts = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const key = String(product?.category ?? "");
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const categories = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...mapCategory(row),
    productCount: counts.get(String(row?.slug ?? "")) ?? 0,
  }));

  return {
    categories,
    stats: {
      total: categories.length,
      withProducts: categories.filter((item) => item.productCount > 0).length,
      empty: categories.filter((item) => item.productCount === 0).length,
      withoutParent: categories.filter((item) => !item.parent).length,
    },
  };
}

/** قائمة مختصرة للاستخدام في قوائم المنتجات. */
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

export function parseCategoryInput(body, { partial = false } = {}) {
  const input = body ?? {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  const row = {};

  if (!partial || has("name")) {
    const name = str(input.name);
    if (name.length < 2) return { ok: false, error: "اسم التصنيف مطلوب (حرفان على الأقل)" };
    if (name.length > 80) return { ok: false, error: "اسم التصنيف طويل جداً" };
    row.name = name;
  }

  if (!partial || has("nameEn")) {
    row.name_en = str(input.nameEn).slice(0, 80);
  }

  if (!partial || has("parent")) {
    const parent = str(input.parent);
    if (parent && !CATEGORY_PARENT_ORDER.includes(parent)) {
      return { ok: false, error: "القسم غير معروف" };
    }
    row.parent = parent || null;
  }

  if (!partial || has("gender")) {
    const gender = str(input.gender);
    if (gender && !GENDER_ORDER.includes(gender)) {
      return { ok: false, error: "الجنس غير معروف" };
    }
    row.gender = gender || null;
  }

  if (!partial || has("blurb")) {
    row.blurb = str(input.blurb).slice(0, 160);
  }

  if (!partial || has("sortOrder")) {
    const raw = input.sortOrder;
    if (raw === "" || raw === null || raw === undefined) {
      if (partial) row.sort_order = 0;
    } else {
      const sortOrder = Number(raw);
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100_000) {
        return { ok: false, error: "الترتيب يجب أن يكون رقماً صحيحاً غير سالب" };
      }
      row.sort_order = sortOrder;
    }
  }

  return { ok: true, row };
}

export async function createCategory(body) {
  const parsed = parseCategoryInput(body);
  if (!parsed.ok) return parsed;

  // التصنيف الجديد يذهب آخر القائمة.
  if (parsed.row.sort_order === undefined) {
    let sortOrder = 0;
    try {
      const last = await sbSelect(
        "categories",
        "select=sort_order&order=sort_order.desc.nullslast&limit=1"
      );
      sortOrder = Number(last?.[0]?.sort_order ?? 0) + 1;
    } catch {
      sortOrder = 0;
    }
    parsed.row.sort_order = sortOrder;
  }

  const allocation = await nextCategorySlug(parsed.row.parent);
  const rows = await sbInsert("categories", [
    {
      ...parsed.row,
      slug: allocation.slug,
      seq: allocation.seq,
    },
  ]);

  return { ok: true, category: mapCategory(rows?.[0]) };
}

export async function updateCategory(slug, body) {
  const parsed = parseCategoryInput(body, { partial: true });
  if (!parsed.ok) return parsed;

  const currentRows = await sbSelect(
    "categories",
    `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );
  const current = Array.isArray(currentRows) ? currentRows[0] : null;

  if (!current) {
    return { ok: false, status: 404, error: "التصنيف غير موجود" };
  }

  const hasParent = Object.prototype.hasOwnProperty.call(parsed.row, "parent");
  const nextParent = hasParent ? parsed.row.parent : current.parent ?? null;
  const moving = nextParent !== (current.parent ?? null);

  const { parent: _parent, ...patch } = parsed.row;
  if (!moving && !Object.keys(patch).length) {
    return { ok: false, status: 400, error: "لا يوجد ما يُحدَّث" };
  }

  if (Object.keys(patch).length) {
    await sbUpdate("categories", `slug=eq.${encodeURIComponent(slug)}`, patch);
  }

  // تغيير القسم: رقم جديد في القسم الجديد + تحديث روابط كل منتجاته،
  // كل ذلك داخل دالة ذرّية تسجّل الروابط القديمة للتحويل في المتجر.
  if (moving) {
    const allocation = await nextCategorySlug(nextParent);
    await sbRpc("stoor_move_category", {
      p_old_slug: slug,
      p_new_slug: allocation.slug,
      p_new_parent: nextParent,
      p_new_seq: allocation.seq,
    });
    return { ok: true, category: await getCategory(allocation.slug) };
  }

  const rows = await sbSelect(
    "categories",
    `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );

  return { ok: true, category: mapCategory(rows?.[0]) };
}

async function getCategory(slug) {
  const rows = await sbSelect(
    "categories",
    `select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? mapCategory(rows[0]) : null;
}

export async function deleteCategory(slug) {
  const [products, children] = await Promise.all([
    sbSelect("products", `select=id&category=eq.${encodeURIComponent(slug)}&limit=1`),
    sbSelect("categories", `select=slug&parent=eq.${encodeURIComponent(slug)}&limit=1`),
  ]);

  if (Array.isArray(products) && products.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "لا يمكن حذف تصنيف يحتوي منتجات — انقل منتجاته إلى تصنيف آخر أولاً",
    };
  }

  if (Array.isArray(children) && children.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "لا يمكن حذف تصنيف يُستخدم كقسم لتصنيفات أخرى",
    };
  }

  const rows = await sbDelete("categories", `slug=eq.${encodeURIComponent(slug)}`);
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 404, error: "التصنيف غير موجود" };
  }
  return { ok: true };
}
