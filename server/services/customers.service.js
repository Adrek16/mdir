import { sbSelect, sbUpdate } from "../supabase.js";
import { mapOrder } from "./orders.service.js";

/**
 * العملاء: ملف واحد لكل حساب يجمع بياناته وطلباته وإنفاقه.
 *
 * المصدر: `profiles` (role = customer) + `orders` عبر `customer_id`.
 * الطلبات القديمة بلا `customer_id` تُربط بالجوال إن طابق جوال الملف.
 * الأرقام تُحسب من الطلبات المؤكدة/المكتملة فقط.
 */

const SALES_STATUSES = new Set(["confirmed", "completed"]);
const MAX_ROWS = 2000;

const digits = (value) => String(value ?? "").replace(/\D/g, "");

function normalizePhone(value) {
  const raw = digits(value);
  if (!raw) return "";
  if (raw.startsWith("967")) return raw;
  if (raw.startsWith("0")) return `967${raw.slice(1)}`;
  return raw;
}

async function readProfiles() {
  const rows = await sbSelect(
    "profiles",
    "select=id,email,full_name,phone,admin_note,provider,created_at&role=eq.customer&order=created_at.desc&limit=" +
      MAX_ROWS
  );
  return Array.isArray(rows) ? rows : [];
}

async function readOrders() {
  const rows = await sbSelect(
    "orders",
    "select=*&order=created_at.desc&limit=" + MAX_ROWS
  );
  return Array.isArray(rows) ? rows.map(mapOrder) : [];
}

function buildCustomers(profiles, orders) {
  const byId = new Map();
  const byPhone = new Map();

  for (const row of profiles) {
    const customer = {
      id: String(row.id),
      name: String(row.full_name ?? "").trim(),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      adminNote: row.admin_note ? String(row.admin_note) : "",
      provider: String(row.provider ?? "email"),
      joinedAt: String(row.created_at ?? ""),
      ordersCount: 0,
      spend: 0,
      lastOrderAt: null,
      firstOrderAt: null,
    };
    byId.set(customer.id, customer);
    const phone = normalizePhone(customer.phone);
    if (phone) byPhone.set(phone, customer);
  }

  for (const order of orders) {
    let customer = order.customerId ? byId.get(String(order.customerId)) : null;
    if (!customer) {
      const phone = normalizePhone(order.customer.phone);
      customer = phone ? byPhone.get(phone) : null;
    }
    if (!customer) continue;

    customer.ordersCount += 1;
    if (SALES_STATUSES.has(order.status ?? "")) {
      customer.spend += Number(order.total ?? 0);
    }
    if (!customer.lastOrderAt || order.createdAt > customer.lastOrderAt) {
      customer.lastOrderAt = order.createdAt;
    }
    if (!customer.firstOrderAt || order.createdAt < customer.firstOrderAt) {
      customer.firstOrderAt = order.createdAt;
    }
    if (!customer.phone && order.customer.phone) {
      customer.phone = order.customer.phone;
      const phone = normalizePhone(order.customer.phone);
      if (phone) byPhone.set(phone, customer);
    }
  }

  return Array.from(byId.values());
}

/** مؤشرات أعلى الصفحة — تُحسب من كل العملاء قبل الفلاتر. */
function buildStats(customers) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const buyers = customers.filter((customer) => customer.ordersCount > 0).length;
  const repeat = customers.filter((customer) => customer.ordersCount >= 2).length;

  return {
    total: customers.length,
    thisMonth: customers.filter((customer) => customer.joinedAt >= monthIso).length,
    buyers,
    repeat,
    repeatRate: customers.length > 0 ? Math.round((repeat / customers.length) * 100) : 0,
  };
}

export async function listCustomers({
  query = "",
  hasOrders = "",
  repeat = "",
  from = "",
  to = "",
} = {}) {
  const [profiles, orders] = await Promise.all([readProfiles(), readOrders()]);
  const all = buildCustomers(profiles, orders);
  const stats = buildStats(all);

  let customers = all;

  const term = String(query ?? "").trim().toLowerCase().slice(0, 60);
  if (term) {
    customers = customers.filter((customer) =>
      [customer.name, customer.email, customer.phone]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }

  if (hasOrders === "yes") customers = customers.filter((c) => c.ordersCount > 0);
  if (hasOrders === "no") customers = customers.filter((c) => c.ordersCount === 0);
  if (repeat === "yes") customers = customers.filter((c) => c.ordersCount >= 2);

  const dayStart = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00` : "";
  const dayEnd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999` : "";
  if (dayStart) customers = customers.filter((c) => c.joinedAt >= dayStart);
  if (dayEnd) customers = customers.filter((c) => c.joinedAt <= dayEnd);

  return { customers, stats };
}

export async function getCustomer(id) {
  if (!id) return null;

  const rows = await sbSelect(
    "profiles",
    `select=id,email,full_name,phone,admin_note,provider,created_at&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  const profile = {
    id: String(row.id),
    name: String(row.full_name ?? "").trim(),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    adminNote: row.admin_note ? String(row.admin_note) : "",
    provider: String(row.provider ?? "email"),
    joinedAt: String(row.created_at ?? ""),
  };

  const byIdRows = await sbSelect(
    "orders",
    `select=*&customer_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=500`
  );

  const orders = Array.isArray(byIdRows) ? byIdRows.map(mapOrder) : [];

  // طلبات قديمة بلا ربط: نطابق الجوال مع جوال الملف.
  const phone = normalizePhone(profile.phone);
  if (phone) {
    const allOrders = await readOrders();
    const linked = new Set(orders.map((order) => order.id));
    for (const order of allOrders) {
      if (order.customerId || linked.has(order.id)) continue;
      if (normalizePhone(order.customer.phone) === phone) orders.push(order);
    }
    orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  const paidOrders = orders.filter((order) => SALES_STATUSES.has(order.status ?? ""));
  const spend = paidOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const units = orders.reduce(
    (sum, order) => sum + order.items.reduce((n, item) => n + (Number(item.qty) || 0), 0),
    0
  );

  return {
    customer: profile,
    orders,
    stats: {
      ordersCount: orders.length,
      paidCount: paidOrders.length,
      spend,
      averageOrder: paidOrders.length > 0 ? Math.round(spend / paidOrders.length) : 0,
      units,
      firstOrderAt: orders.length ? orders[orders.length - 1].createdAt : null,
      lastOrderAt: orders.length ? orders[0].createdAt : null,
    },
  };
}

export async function saveCustomerNote(id, note) {
  const value = String(note ?? "").trim().slice(0, 500);
  const rows = await sbUpdate(
    "profiles",
    `id=eq.${encodeURIComponent(id)}`,
    { admin_note: value || null }
  );
  return Array.isArray(rows) && rows[0] ? value : null;
}
