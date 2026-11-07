/**
 * مصدر واحد للتسميات والحالات — يستورده الخادم والواجهة معاً.
 *
 * لا تُكرّر هذه القيم في أي ملف آخر: أي تغيير هنا ينعكس على الطرفين.
 */

export const ORDER_STATUS_LABEL = Object.freeze({
  new: "جديد",
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغي",
});

export const ORDER_STATUS_ORDER = Object.freeze([
  "new",
  "confirmed",
  "completed",
  "cancelled",
]);

/** ألوان الشارات — تقابلها classes في components.css */
export const ORDER_STATUS_TONE = Object.freeze({
  new: "copper",
  confirmed: "info",
  completed: "success",
  cancelled: "danger",
});

export const PAYMENT_STATUS_LABEL = Object.freeze({
  unpaid: "غير مدفوع",
  pending: "بانتظار المراجعة",
  paid: "مدفوع",
  failed: "إيصال مرفوض",
  refunded: "مُسترجع",
});

export const PAYMENT_STATUS_ORDER = Object.freeze([
  "unpaid",
  "pending",
  "paid",
  "failed",
  "refunded",
]);

export const PAYMENT_STATUS_TONE = Object.freeze({
  unpaid: "muted",
  pending: "warning",
  paid: "success",
  failed: "danger",
  refunded: "indigo",
});

export const PAYMENT_METHOD_LABEL = Object.freeze({
  cod: "الدفع عند الاستلام",
  transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
  card: "بطاقة (ملغاة)",
});

/* ── المخزون ────────────────────────────────────────────── */

export const STOCK_STATE_LABEL = Object.freeze({
  none: "لم يُخصم",
  reserved: "مخصوم",
  released: "أُعيد",
});

export const STOCK_STATE_ORDER = Object.freeze(["none", "reserved", "released"]);

export const STOCK_STATE_TONE = Object.freeze({
  none: "muted",
  reserved: "success",
  released: "warning",
});

/* ── المنتجات ───────────────────────────────────────────── */

export const GENDER_ORDER = Object.freeze(["men", "women", "unisex", "kids"]);

export const GENDER_LABEL = Object.freeze({
  men: "رجالي",
  women: "نسائي",
  unisex: "للجنسين",
  kids: "أطفال",
});

// «الأكثر مبيعاً» ليست شارة يدوية — تُحسب من الطلبات المؤكدة في المتجر.
// نُبقي تسميتها في BADGE_LABEL لعرض الصفوف القديمة فقط، ولا نعرضها كخيار.
export const BADGE_ORDER = Object.freeze(["new", "sale", "limited"]);

export const BADGE_LABEL = Object.freeze({
  new: "جديد",
  best: "الأكثر مبيعاً",
  sale: "خصم",
  limited: "إصدار محدود",
});

export const ARTWORK_ORDER = Object.freeze([
  "perfume",
  "necklace",
  "earrings",
  "bracelet",
  "ring",
  "set",
  "watch",
  "cufflinks",
  "bag",
]);

export const ARTWORK_LABEL = Object.freeze({
  perfume: "عطر",
  necklace: "سلسلة",
  earrings: "أقراط",
  bracelet: "سوار",
  ring: "خاتم",
  set: "طقم",
  watch: "ساعة",
  cufflinks: "أزرار أكمام",
  bag: "حقيبة",
});

/* ── التصنيفات ───────────────────────────────────────────── */


/** الأقسام العليا المعروضة في صفحة «كل التصنيفات» بالمتجر. */
export const CATEGORY_PARENT_ORDER = Object.freeze(["perfumes", "accessories", "bags"]);

export const CATEGORY_PARENT_LABEL = Object.freeze({
  perfumes: "العطور",
  accessories: "الإكسسوارات",
  bags: "الحقائب",
});

export function categoryParentLabel(value) {
  if (!value) return "بلا قسم";
  return CATEGORY_PARENT_LABEL[value] ?? "قسم غير معروف";
}

export function orderStatusLabel(value) {
  return ORDER_STATUS_LABEL[value] ?? "غير معروف";
}

export function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABEL[value] ?? "غير معروف";
}

export function paymentMethodLabel(value) {
  return PAYMENT_METHOD_LABEL[value] ?? "غير معروف";
}

export function stockStateLabel(value) {
  return STOCK_STATE_LABEL[value] ?? "غير معروف";
}

export function genderLabel(value) {
  return GENDER_LABEL[value] ?? "غير معروف";
}

export function badgeLabel(value) {
  return value ? (BADGE_LABEL[value] ?? "غير معروف") : "بلا شارة";
}

export function artworkLabel(value) {
  return ARTWORK_LABEL[value] ?? "غير معروف";
}
