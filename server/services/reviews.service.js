import { sbCount, sbDelete, sbRpc, sbSelect, sbUpdate } from "../supabase.js";
import { notifyStoreRevalidate } from "./orders.service.js";

/**
 * مراجعة تقييمات العملاء.
 *
 * التقييم لا يظهر في المتجر قبل اعتماده. كل اعتماد/رفض/حذف يعيد حساب
 * كاش المنتج (`rating` و`reviews`) من التقييمات المعتمدة فقط عبر
 * دالة `refresh_product_rating` في القاعدة.
 */

const STATUSES = ["pending", "approved", "rejected"];
const MAX_REVIEWS = 1000;

function mapReview(row, productMap, profileMap) {
  const product = productMap.get(String(row.product_id)) || null;
  const profile = profileMap.get(String(row.customer_id)) || null;

  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: product ? String(product.name) : "منتج محذوف",
    productSlug: product?.slug ? String(product.slug) : "",
    customerId: String(row.customer_id),
    customerName: profile?.full_name ? String(profile.full_name) : "عميل",
    customerEmail: profile?.email ? String(profile.email) : "",
    orderId: row.order_id ? String(row.order_id) : null,
    rating: Number(row.rating) || 0,
    comment: String(row.comment ?? ""),
    status: STATUSES.includes(row.status) ? row.status : "pending",
    managerReply: row.manager_reply ? String(row.manager_reply) : "",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function readProducts() {
  const rows = await sbSelect("products", "select=id,name,slug&limit=2000");
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id), row]));
}

async function readProfiles() {
  const rows = await sbSelect("profiles", "select=id,full_name,email&limit=5000");
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id), row]));
}

async function readAllReviews() {
  const rows = await sbSelect(
    "product_reviews",
    `select=*&order=created_at.desc&limit=${MAX_REVIEWS}`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listReviews({ status = "", query = "" } = {}) {
  const [rows, productMap, profileMap] = await Promise.all([
    readAllReviews(),
    readProducts(),
    readProfiles(),
  ]);

  const counts = {
    all: rows.length,
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  const reviews = [];
  for (const row of rows) {
    const review = mapReview(row, productMap, profileMap);
    if (review.status in counts) counts[review.status] += 1;
    reviews.push(review);
  }

  let filtered = reviews;
  if (STATUSES.includes(status)) {
    filtered = filtered.filter((review) => review.status === status);
  }

  const term = String(query ?? "").trim().toLowerCase().slice(0, 60);
  if (term) {
    filtered = filtered.filter((review) =>
      [review.productName, review.customerName, review.customerEmail, review.comment]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }

  return { reviews: filtered, counts };
}

export async function pendingReviewsCount() {
  return sbCount("product_reviews", "status=eq.pending");
}

async function refreshRating(productId) {
  if (!productId) return;
  try {
    await sbRpc("refresh_product_rating", { p_product_id: productId });
  } catch (error) {
    console.error("[reviews] refresh rating failed", error?.message ?? error);
  }
}

async function findReview(id) {
  const rows = await sbSelect(
    "product_reviews",
    `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateReview(id, body = {}) {
  const existing = await findReview(id);
  if (!existing) return { ok: false, status: 404, error: "التقييم غير موجود" };

  const patch = {};

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.includes(status)) {
      return { ok: false, status: 400, error: "حالة تقييم غير معروفة" };
    }
    patch.status = status;
  }

  if (body.managerReply !== undefined) {
    if (typeof body.managerReply !== "string") {
      return { ok: false, status: 400, error: "رد المدير غير صالح" };
    }
    const reply = body.managerReply.trim().slice(0, 600);
    patch.manager_reply = reply || null;
  }

  if (!Object.keys(patch).length) {
    return { ok: false, status: 400, error: "لا يوجد تغيير مطلوب" };
  }

  const rows = await sbUpdate(
    "product_reviews",
    `id=eq.${encodeURIComponent(id)}`,
    patch
  );
  const updated = Array.isArray(rows) ? rows[0] : null;
  if (!updated) return { ok: false, status: 404, error: "التقييم غير موجود" };

  await refreshRating(updated.product_id);
  await notifyStoreRevalidate();

  return { ok: true, review: updated };
}

export async function deleteReview(id) {
  const existing = await findReview(id);
  if (!existing) return { ok: false, status: 404, error: "التقييم غير موجود" };

  await sbDelete("product_reviews", `id=eq.${encodeURIComponent(id)}`);
  await refreshRating(existing.product_id);
  await notifyStoreRevalidate();

  return { ok: true };
}
