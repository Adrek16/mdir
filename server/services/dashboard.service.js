import { sbCount, sbSelect } from "../supabase.js";
import { listOrders } from "./orders.service.js";
import { pendingReviewsCount } from "./reviews.service.js";

/**
 * أرقام الصفحة الرئيسية وقوائمها القصيرة.
 *
 * العدّ يتم في القاعدة (HEAD + count) بدل تحميل كل الطلبات،
 * والقيمة المالية تُجمع من الطلبات المؤكدة والمكتملة فقط.
 */

/** الحالات التي تُحتسب ضمن قيمة المبيعات. */
const SALES_STATUSES = ["confirmed", "completed"];

/** بداية اليوم بتوقيت الخادم — كافٍ لتقرير محلي. */
function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

async function sumConfirmedValue() {
  const rows = await sbSelect(
    "orders",
    `select=total&status=in.(${SALES_STATUSES.join(",")})&limit=1000`
  );

  return (Array.isArray(rows) ? rows : []).reduce(
    (total, row) => total + Number(row?.total ?? 0),
    0
  );
}

export async function getDashboard() {
  const todayIso = startOfToday();

  const [
    totalOrders,
    newOrders,
    todayOrders,
    pendingPayment,
    pendingReviews,
    recentOrders,
    pendingProofs,
  ] = await Promise.all([
    sbCount("orders"),
    sbCount("orders", "status=eq.new"),
    sbCount("orders", `created_at=gte.${encodeURIComponent(todayIso)}`),
    sbCount("orders", "payment=in.(transfer,wallet)&payment_status=eq.pending"),
    pendingReviewsCount(),
    listOrders({ limit: 6 }),
    listOrders({ payment: "prepaid", paymentStatus: "pending", limit: 5 }),
  ]);

  return {
    stats: {
      totalOrders,
      newOrders,
      todayOrders,
      pendingPayment,
      pendingReviews,
      confirmedValue: await sumConfirmedValue(),
    },
    recentOrders,
    pendingProofs,
  };
}
