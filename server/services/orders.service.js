import { env } from "../env.js";
import { sbRpc, sbSelect, sbUpdate } from "../supabase.js";
import {
  ORDER_STATUS_ORDER,
  PAYMENT_STATUS_ORDER,
} from "../../public/assets/js/core/domain.js";

/**
 * كل ما يخص الطلبات: قراءة، تحويل الصف إلى شكل ثابت، وتطبيق التغييرات
 * بنفس قواعد متجر Next (المخزون، مراجعة الإيصال، التأكيد التلقائي).
 */

const MAX_LIMIT = 200;

export function mapOrder(row) {
  const proofPath = row?.payment_proof_path ? String(row.payment_proof_path) : null;
  return {
    id: String(row?.id ?? ""),
    createdAt: String(row?.created_at ?? ""),
    customerId: row?.customer_id ? String(row.customer_id) : null,
    customerEmail: row?.customer_email ? String(row.customer_email) : null,
    status: row?.status || "new",
    items: Array.isArray(row?.items) ? row.items : [],
    subtotal: Number(row?.subtotal ?? 0),
    discount: Number(row?.discount ?? 0),
    total: Number(row?.total ?? 0),
    couponCode: row?.coupon_code ? String(row.coupon_code) : null,
    customer: {
      name: String(row?.customer_name ?? ""),
      phone: String(row?.customer_phone ?? ""),
      notes: row?.notes ? String(row.notes) : null,
    },
    payment:
      row?.payment === "transfer" || row?.payment === "wallet" || row?.payment === "card"
        ? row.payment
        : "cod",
    paymentMethodId: row?.payment_method_id ? String(row.payment_method_id) : null,
    paymentStatus: row?.payment_status || "unpaid",
    paymentRef: row?.payment_ref ? String(row.payment_ref) : null,
    paymentProvider: row?.payment_provider ? String(row.payment_provider) : null,
    paymentProofPath: proofPath,
    paymentProofAt: row?.payment_proof_at ? String(row.payment_proof_at) : null,
    paymentReviewNote: row?.payment_review_note ? String(row.payment_review_note) : null,
    adminNote: row?.admin_note ? String(row.admin_note) : null,
    paymentProofIsPdf: Boolean(proofPath?.toLowerCase().endsWith(".pdf")),
    stockState: row?.stock_state || "none",
    stockReleased: Boolean(row?.stock_released),
  };
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return MAX_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export async function listOrders({
  query = "",
  status = "",
  payment = "",
  paymentStatus = "",
  stockState = "",
  from = "",
  to = "",
  limit,
} = {}) {
  const filters = [];

  if (ORDER_STATUS_ORDER.includes(status)) {
    filters.push(`status=eq.${encodeURIComponent(status)}`);
  }
  if (payment === "prepaid") {
    filters.push("payment=in.(transfer,wallet)");
  } else if (["cod", "transfer", "wallet", "card"].includes(payment)) {
    filters.push(`payment=eq.${encodeURIComponent(payment)}`);
  }
  if (PAYMENT_STATUS_ORDER.includes(paymentStatus)) {
    filters.push(`payment_status=eq.${encodeURIComponent(paymentStatus)}`);
  }
  if (["none", "reserved", "released"].includes(stockState)) {
    filters.push(`stock_state=eq.${encodeURIComponent(stockState)}`);
  }

  const dayStart = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00` : "";
  const dayEnd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999` : "";
  if (dayStart) filters.push(`created_at=gte.${encodeURIComponent(dayStart)}`);
  if (dayEnd) filters.push(`created_at=lte.${encodeURIComponent(dayEnd)}`);

  const term = String(query ?? "").trim().slice(0, 60);
  if (term) {
    const encoded = encodeURIComponent(term.replace(/[,()]/g, " "));
    const pattern = `*${encoded}*`;
    filters.push(
      `or=(id.ilike.${pattern},customer_name.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern})`
    );
  }

  const queryString = [
    "select=*",
    ...filters,
    "order=created_at.desc",
    `limit=${clampLimit(limit)}`,
  ].join("&");

  const rows = await sbSelect("orders", queryString);
  return Array.isArray(rows) ? rows.map(mapOrder) : [];
}

export async function getOrder(id) {
  const rows = await sbSelect(
    "orders",
    `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? mapOrder(rows[0]) : null;
}

async function updateStatus(id, status) {
  const rows = await sbUpdate(
    "orders",
    `id=eq.${encodeURIComponent(id)}`,
    { status }
  );
  return Array.isArray(rows) && rows[0] ? mapOrder(rows[0]) : null;
}

async function updatePayment(id, patch) {
  const row = {};
  if ("status" in patch) row.payment_status = patch.status;
  if ("proofPath" in patch) row.payment_proof_path = patch.proofPath;
  if ("proofAt" in patch) row.payment_proof_at = patch.proofAt;
  if ("reviewNote" in patch) row.payment_review_note = patch.reviewNote;
  if ("ref" in patch) row.payment_ref = patch.ref;
  if ("provider" in patch) row.payment_provider = patch.provider;

  if (!Object.keys(row).length) return null;

  const rows = await sbUpdate("orders", `id=eq.${encodeURIComponent(id)}`, row);
  return Array.isArray(rows) && rows[0] ? mapOrder(rows[0]) : null;
}

export async function releaseOrderStock(id) {
  return sbRpc("release_order_stock", { p_order_id: id });
}

/** تأكيد الطلب وخصم مخزونه ذرّياً — يرفع OUT_OF_STOCK عند النقص. */
export async function confirmOrderStock(id) {
  return sbRpc("confirm_order_stock", { p_order_id: id });
}

/**
 * تطبيق تعديل المدير على طلب — مع كل القيود.
 * يعيد { ok: true, reopened, cancelled } أو { ok: false, status, error }.
 */
export async function applyOrderUpdate(id, body = {}) {
  const existing = await getOrder(id);
  if (!existing) return { ok: false, status: 404, error: "الطلب غير موجود" };

  const hasStatus = body.status !== undefined && body.status !== null && body.status !== "";
  const hasPayment =
    body.paymentStatus !== undefined &&
    body.paymentStatus !== null &&
    body.paymentStatus !== "";
  const reviewNote = String(body.reviewNote ?? "").trim().slice(0, 300);
  const hasAdminNote = typeof body.adminNote === "string";
  const adminNote = hasAdminNote ? body.adminNote.trim().slice(0, 500) : null;

  if (!hasStatus && !hasPayment && !reviewNote && !hasAdminNote) {
    return { ok: false, status: 400, error: "لا يوجد تغيير مطلوب" };
  }

  const status = String(body.status ?? "");
  const paymentStatus = String(body.paymentStatus ?? "");

  if (hasStatus && !ORDER_STATUS_ORDER.includes(status)) {
    return { ok: false, status: 400, error: "حالة طلب غير معروفة" };
  }
  if (hasPayment && !PAYMENT_STATUS_ORDER.includes(paymentStatus)) {
    return { ok: false, status: 400, error: "حالة دفع غير معروفة" };
  }

  // مراجعة الإيصال خاصة بالدفع المسبق (تحويل/محفظة).
  if (
    hasPayment &&
    existing.payment !== "transfer" &&
    existing.payment !== "wallet" &&
    (paymentStatus === "pending" || paymentStatus === "failed")
  ) {
    return { ok: false, status: 400, error: "مراجعة الإيصال خاصة بالدفع المسبق (تحويل/محفظة)" };
  }

  // لا اعتماد ولا رفض بلا إيصال مرفوع.
  if (
    hasPayment &&
    (existing.payment === "transfer" || existing.payment === "wallet") &&
    (paymentStatus === "paid" || paymentStatus === "failed") &&
    !existing.paymentProofPath
  ) {
    return {
      ok: false,
      status: 409,
      error: "لا يوجد إيصال مرفوع لهذا الطلب — اطلب من العميل رفعه أولاً",
    };
  }

  if (hasPayment && paymentStatus === "paid" && existing.status === "cancelled") {
    return { ok: false, status: 409, error: "لا يمكن اعتماد دفع طلب ملغي" };
  }

  const currentStatus = existing.status ?? "new";
  let nextStatus = hasStatus ? status : null;

  // اعتماد الإيصال يؤكد الطلب الجديد تلقائياً.
  if (hasPayment && paymentStatus === "paid" && !hasStatus && currentStatus === "new") {
    nextStatus = "confirmed";
  }

  // إعادة فتح طلب ملغي: يعود «جديداً» بلا حجز مخزون.
  // الخصم يحدث فقط عند التأكيد عبر confirm_order_stock.
  const reopening =
    nextStatus !== null && existing.status === "cancelled" && nextStatus !== "cancelled";

  let stockChanged = false;

  if (nextStatus === "confirmed" && currentStatus === "new") {
    // التأكيد والخصم ذرّياً: إن نقصت أي قطعة لا يُخصم شيء ويبقى الطلب جديداً.
    try {
      await confirmOrderStock(id);
      stockChanged = true;
    } catch (error) {
      const outOfStock = String(error?.message ?? "").match(/OUT_OF_STOCK:([A-Za-z0-9_-]+)/)?.[1];
      if (outOfStock) {
        return {
          ok: false,
          status: 409,
          error: "نفدت الكمية من أحد منتجات الطلب — أعد التوريد ثم حاول مجدداً",
        };
      }
      throw error;
    }
  } else if (nextStatus !== null && nextStatus !== currentStatus) {
    if (nextStatus === "confirmed" && currentStatus !== "confirmed") {
      return { ok: false, status: 409, error: "لا يمكن تأكيد طلب في هذه الحالة" };
    }

    const updated = await updateStatus(id, nextStatus);
    if (!updated) return { ok: false, status: 404, error: "الطلب غير موجود" };

    if (nextStatus === "cancelled") {
      try {
        await releaseOrderStock(id);
        stockChanged = true;
      } catch (error) {
        console.error("[orders] release stock failed", error);
      }
    }
  }

  if (hasPayment) {
    const rejectedNote = reviewNote || "الإيصال غير واضح أو المبلغ غير مطابق";
    await updatePayment(id, {
      status: paymentStatus,
      ...(paymentStatus === "failed" ? { reviewNote: rejectedNote } : {}),
      ...(paymentStatus === "paid" ? { reviewNote: null } : {}),
    });
  } else if (reviewNote && (existing.payment === "transfer" || existing.payment === "wallet")) {
    await updatePayment(id, { reviewNote });
  }

  if (hasAdminNote) {
    await sbUpdate("orders", `id=eq.${encodeURIComponent(id)}`, {
      admin_note: adminNote || null,
    });
  }

  return {
    ok: true,
    reopened: reopening,
    confirmed: nextStatus === "confirmed" && currentStatus === "new",
    cancelled: nextStatus === "cancelled",
    stockChanged,
  };
}

/**
 * إبلاغ متجر Next بتغيّر الكتالوج حتى يحدّث كاشه.
 * فشل الإبلاغ لا يفشل العملية — المتجر سيحدّث نفسه لاحقاً.
 */
export async function notifyStoreRevalidate() {
  if (!env.revalidateUrl || !env.revalidateSecret) return;

  try {
    await fetch(env.revalidateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": env.revalidateSecret,
      },
      body: JSON.stringify({ tag: "catalog" }),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[revalidate] تعذّر إبلاغ المتجر:", error?.message ?? error);
  }
}
