import { sbSelect } from "../supabase.js";
import { mapOrder } from "./orders.service.js";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_ORDER,
  PAYMENT_METHOD_LABEL,
} from "../../public/assets/js/core/domain.js";

/**
 * التقارير: تجميع حقيقي من `orders` و`products` و`profiles` داخل نطاق زمني.
 *
 * - الإيراد من الطلبات `confirmed` + `completed` فقط.
 * - الوحدات والمنتجات والتصنيفات من `items` داخل نفس الطلبات.
 * - التوقيت: Asia/Aden (UTC+3) ثابتاً — لا نعتمد على توقيت الخادم.
 * - لا أرقام يدوية: «الأكثر مبيعاً» من `sales_count` و«الأعلى تقييماً» من `rating`.
 */

const SALES_STATUSES = new Set(["confirmed", "completed"]);
const ADEN_OFFSET_MIN = 180;
const DAY_MS = 86_400_000;
const MAX_ORDERS = 5000;
const MAX_PRODUCTS = 2000;

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const pad = (value) => String(value).padStart(2, "0");

function shiftToAden(date) {
  return new Date(date.getTime() + ADEN_OFFSET_MIN * 60_000);
}

/** منتصف ليل يوم يمني معيّن — يعيد Date بتوقيت UTC. */
function adenDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day) - ADEN_OFFSET_MIN * 60_000);
}

function adenDayStart(date = new Date()) {
  const d = shiftToAden(date);
  return adenDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function adenDayKey(iso) {
  const d = shiftToAden(new Date(iso));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function adenMonthKey(iso) {
  const d = shiftToAden(new Date(iso));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

/** يحوّل مفتاح نطاق إلى { start, end } بتوقيت اليمن. */
export function resolvePeriod(key = "30d", from = "", to = "") {
  const now = new Date();
  const shifted = shiftToAden(now);

  switch (key) {
    case "today":
      return {
        key,
        label: "اليوم",
        start: adenDayStart(now),
        end: now,
      };
    case "7d":
      return {
        key,
        label: "آخر ٧ أيام",
        start: adenDayStart(new Date(now.getTime() - 6 * DAY_MS)),
        end: now,
      };
    case "month":
      return {
        key,
        label: "هذا الشهر",
        start: adenDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1),
        end: now,
      };
    case "last_month": {
      const start = adenDate(shifted.getUTCFullYear(), shifted.getUTCMonth() - 1, 1);
      return {
        key,
        label: "الشهر الماضي",
        start,
        end: new Date(adenDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1).getTime() - 1),
      };
    }
    case "custom": {
      const startParts = parseDay(from);
      const endParts = parseDay(to);
      if (startParts && endParts) {
        return {
          key,
          label: `${from} ← ${to}`,
          start: adenDate(startParts.year, startParts.month, startParts.day),
          end: new Date(
            adenDate(endParts.year, endParts.month, endParts.day + 1).getTime() - 1
          ),
        };
      }
      break;
    }
    default:
      break;
  }

  return {
    key: "30d",
    label: "آخر ٣٠ يوماً",
    start: adenDayStart(new Date(now.getTime() - 29 * DAY_MS)),
    end: now,
  };
}

function buildBuckets(start, end) {
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
  const monthMode = days > 92;
  const buckets = [];

  if (monthMode) {
    const s = shiftToAden(start);
    const e = shiftToAden(end);
    let year = s.getUTCFullYear();
    let month = s.getUTCMonth();
    const lastYear = e.getUTCFullYear();
    const lastMonth = e.getUTCMonth();

    while (year < lastYear || (year === lastYear && month <= lastMonth)) {
      buckets.push({
        key: `${year}-${pad(month + 1)}`,
        label: `${MONTHS[month]} ${year}`,
        revenue: 0,
        orders: 0,
      });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return { buckets, monthMode };
  }

  const s = shiftToAden(start);
  const e = shiftToAden(end);
  const cursor = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));

  while (cursor <= last) {
    const month = cursor.getUTCMonth();
    buckets.push({
      key: `${cursor.getUTCFullYear()}-${pad(month + 1)}-${pad(cursor.getUTCDate())}`,
      label: `${cursor.getUTCDate()} ${MONTHS[month]}`,
      revenue: 0,
      orders: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { buckets, monthMode };
}

function customerKey(order) {
  return (
    order.customerId ||
    String(order.customer?.phone ?? "").replace(/\D/g, "") ||
    String(order.customer?.name ?? "").trim() ||
    order.id
  );
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function topN(map, limit, sorter) {
  return Array.from(map.values()).sort(sorter).slice(0, limit);
}

function byRevenue(a, b) {
  return b.revenue - a.revenue || b.units - a.units;
}

function byUnits(a, b) {
  return b.units - a.units || b.revenue - a.revenue;
}

export async function getReports({ period: periodKey = "30d", from = "", to = "" } = {}) {
  const period = resolvePeriod(periodKey, from, to);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  const [orderRows, productRows, categoryRows, newCustomerRows] = await Promise.all([
    sbSelect(
      "orders",
      `select=*&created_at=gte.${encodeURIComponent(startIso)}&created_at=lte.${encodeURIComponent(
        endIso
      )}&order=created_at.asc&limit=${MAX_ORDERS}`
    ),
    sbSelect(
      "products",
      `select=id,name,category,price,stock,rating,reviews,sales_count,popularity_score,active&limit=${MAX_PRODUCTS}`
    ),
    sbSelect("categories", "select=slug,name,parent&limit=200"),
    sbSelect(
      "profiles",
      `select=id&role=eq.customer&created_at=gte.${encodeURIComponent(
        startIso
      )}&created_at=lte.${encodeURIComponent(endIso)}&limit=5000`
    ),
  ]);

  const orders = (Array.isArray(orderRows) ? orderRows : []).map(mapOrder);
  const products = Array.isArray(productRows) ? productRows : [];
  const categories = Array.isArray(categoryRows) ? categoryRows : [];
  const newCustomers = Array.isArray(newCustomerRows) ? newCustomerRows.length : 0;

  const productById = new Map(products.map((product) => [String(product.id), product]));
  const categoryName = new Map(
    categories.map((category) => [String(category.slug), String(category.name || category.slug)])
  );

  const byStatus = Object.fromEntries(ORDER_STATUS_ORDER.map((status) => [status, 0]));
  const paymentMap = new Map();
  const productMap = new Map();
  const categoryMap = new Map();
  const customerMap = new Map();
  const repeatKeys = new Map();

  let revenue = 0;
  let salesOrders = 0;
  let units = 0;
  let cancelled = 0;

  for (const order of orders) {
    const status = ORDER_STATUS_ORDER.includes(order.status) ? order.status : "new";
    byStatus[status] += 1;
    const isSale = SALES_STATUSES.has(status);
    if (status === "cancelled") cancelled += 1;

    const payment = String(order.payment || "cod");
    const pay = paymentMap.get(payment) || { method: payment, count: 0, amount: 0 };
    pay.count += 1;
    pay.amount += Number(order.total) || 0;
    paymentMap.set(payment, pay);

    if (!isSale) continue;

    salesOrders += 1;
    revenue += Number(order.total) || 0;

    const key = customerKey(order);
    const seen = repeatKeys.get(key) || 0;
    repeatKeys.set(key, seen + 1);

    const customer = customerMap.get(key) || {
      key,
      name: order.customer?.name || "عميل",
      phone: order.customer?.phone || "",
      orders: 0,
      spend: 0,
    };
    customer.orders += 1;
    customer.spend += Number(order.total) || 0;
    customerMap.set(key, customer);

    for (const item of order.items) {
      const qty = Math.max(0, Number(item.qty) || 0);
      if (!qty) continue;
      const price = Number(item.price) || 0;
      const lineRevenue = price * qty;
      units += qty;

      const productId = item.productId ? String(item.productId) : "";
      const product = productId ? productById.get(productId) : null;
      const productKey = productId || item.slug || item.name || "—";
      const entry = productMap.get(productKey) || {
        id: productId || "",
        name: product?.name || item.name || "منتج محذوف",
        units: 0,
        revenue: 0,
        category: product?.category || item.category || "",
      };
      entry.units += qty;
      entry.revenue += lineRevenue;
      productMap.set(productKey, entry);

      const categorySlug = product?.category || item.category || "";
      const categoryLabel = categorySlug
        ? categoryName.get(String(categorySlug)) || String(categorySlug)
        : "غير محدد";
      const cat = categoryMap.get(categoryLabel) || { name: categoryLabel, units: 0, revenue: 0 };
      cat.units += qty;
      cat.revenue += lineRevenue;
      categoryMap.set(categoryLabel, cat);
    }
  }

  const repeatCustomers = Array.from(repeatKeys.values()).filter((count) => count >= 2).length;

  // ── الخط الزمني ──────────────────────────────────────────
  const { buckets, monthMode } = buildBuckets(period.start, period.end);
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const order of orders) {
    const key = monthMode ? adenMonthKey(order.createdAt) : adenDayKey(order.createdAt);
    const bucket = bucketByKey.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    if (SALES_STATUSES.has(order.status)) {
      bucket.revenue += Number(order.total) || 0;
    }
  }

  // ── المنتجات: الأكثر مبيعاً والأعلى تقييماً (كاش حقيقي) ──
  const activeProducts = products.filter((product) => product.active !== false);

  const topSelling = activeProducts
    .filter((product) => Number(product.sales_count) > 0)
    .sort(
      (a, b) =>
        Number(b.sales_count) - Number(a.sales_count) ||
        Number(b.popularity_score) - Number(a.popularity_score)
    )
    .slice(0, 5)
    .map((product) => ({
      id: String(product.id),
      name: String(product.name),
      sales: Number(product.sales_count) || 0,
      rating: Number(product.rating) || 0,
    }));

  const topRated = activeProducts
    .filter((product) => Number(product.reviews) > 0)
    .sort(
      (a, b) =>
        Number(b.rating) - Number(a.rating) || Number(b.reviews) - Number(a.reviews)
    )
    .slice(0, 5)
    .map((product) => ({
      id: String(product.id),
      name: String(product.name),
      rating: Number(product.rating) || 0,
      reviews: Number(product.reviews) || 0,
    }));

  const lowStock = activeProducts
    .filter((product) => Number(product.stock) <= 5)
    .sort((a, b) => Number(a.stock) - Number(b.stock))
    .slice(0, 20)
    .map((product) => ({
      id: String(product.id),
      name: String(product.name),
      stock: Number(product.stock) || 0,
    }));

  const cancellations = orders
    .filter((order) => order.status === "cancelled")
    .slice(-20)
    .reverse()
    .map((order) => ({
      id: order.id,
      name: order.customer?.name || "عميل",
      reason: order.adminNote || order.paymentReviewNote || "غير مسجّل",
      at: order.createdAt,
    }));

  const statusBreakdown = ORDER_STATUS_ORDER.map((status) => ({
    status,
    label: ORDER_STATUS_LABEL[status] || status,
    count: byStatus[status],
    share: orders.length > 0 ? Math.round((byStatus[status] / orders.length) * 100) : 0,
  }));

  const payments = Array.from(paymentMap.values())
    .map((payment) => ({
      ...payment,
      label: PAYMENT_METHOD_LABEL[payment.method] || payment.method,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    period: {
      key: period.key,
      label: period.label,
      start: startIso,
      end: endIso,
      monthMode,
    },
    kpi: {
      revenue: round(revenue),
      orders: orders.length,
      salesOrders,
      avgOrder: salesOrders > 0 ? round(revenue / salesOrders) : 0,
      units: round(units),
      cancelRate: orders.length > 0 ? Math.round((cancelled / orders.length) * 100) : 0,
      newCustomers,
      repeatCustomers,
    },
    statusBreakdown,
    payments,
    timeline: buckets,
    topProducts: topN(productMap, 10, byRevenue),
    topCategories: topN(categoryMap, 10, byRevenue),
    topCustomers: topN(customerMap, 10, (a, b) => b.spend - a.spend),
    topSelling,
    topRated,
    lowStock,
    cancellations,
  };
}

/** مجموع المبيعات لكل الحالات — يُستخدم في لوحة المعلومات لاحقاً. */
export function isSaleStatus(status) {
  return SALES_STATUSES.has(status);
}
