import { sbRpc } from "../supabase.js";

/**
 * توليد الروابط (slug) تلقائياً على الخادم.
 *
 * القاعدة:
 *   - رابط التصنيف = قسمه الرئيسي + رقم متسلسل داخل القسم  → perfumes-1
 *   - رابط المنتج  = رابط تصنيفه + رقم متسلسل داخل التصنيف → perfumes-1-3
 *
 * الأرقام تُصرف من عدّاد ذرّي في قاعدة البيانات (stoor_next_slug_seq)
 * ولا تُعاد بعد الحذف، فلا يتكرر رابط أبداً. لا تُعرض هذه الروابط في
 * واجهة المدير ولا تُدخل يدوياً.
 */

const str = (value) => (typeof value === "string" ? value.trim() : "");

/** قسم التصنيف، و«general» عندما يكون التصنيف بلا قسم. */
export function categorySection(parent) {
  return str(parent) || "general";
}

async function nextSeq(scope) {
  const value = await sbRpc("stoor_next_slug_seq", { p_scope: scope });
  const seq = Number(value);

  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error("تعذّر توليد رقم الرابط التالي");
  }

  return seq;
}

/** يصرف الرابط التالي لتصنيف داخل قسمه. */
export async function nextCategorySlug(parent) {
  const section = categorySection(parent);
  const seq = await nextSeq(`category:${section}`);

  return { slug: `${section}-${seq}`, seq };
}

/** يصرف الرابط التالي لمنتج داخل تصنيفه. */
export async function nextProductSlug(categorySlug) {
  const category = str(categorySlug);
  if (!category) throw new Error("لا يمكن توليد رابط منتج بلا تصنيف");

  const seq = await nextSeq(`product:${category}`);

  return { slug: `${category}-${seq}`, seq };
}
