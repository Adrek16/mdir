/**
 * اختبار قبول للطلبات والإعدادات في لوحة المدير.
 *
 * يغطي:
 *  - اعتماد إيصال التحويل وتأكيد الطلب تلقائياً.
 *  - رفض الإيصال مع ملاحظة.
 *  - منع الاعتماد بلا إيصال.
 *  - منع مراجعة إيصال على طلب غير تحويلي.
 *  - انتقالات الحالة (confirmed/completed) والحالة غير المعروفة.
 *  - إلغاء الطلب يحرّر المخزون، وإعادة فتحه يحجزه.
 *  - إعادة الفتح عند نفاد المخزون → 409.
 *  - قراءة/حفظ الحساب البنكي والتحقق من الآيبان.
 *
 * التشغيل:
 *   npm run test:acceptance
 *
 * ينشئ بيانات مؤقتة ثم ينظّفها، ويعيد الإعدادات البنكية كما كانت.
 * العناوين وبيانات الدخول تُقرأ من متغيرات البيئة: MANAGER_URL،
 * STORE_URL، ADMIN_EMAIL، ADMIN_PASSWORD، SUPABASE_*.
 */

import { adminCredentials, managerUrl, storeUrl, supabaseConfig } from "./config.mjs";

const manager = managerUrl();
const store = storeUrl();
const { supabaseUrl, serviceKey } = supabaseConfig();

const sbHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: Boolean(ok), extra });

let cookie = "";

async function call(path, options = {}) {
  const response = await fetch(manager + path, {
    ...options,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  for (const item of response.headers.getSetCookie?.() || []) {
    if (item.startsWith("stoor_manager=")) cookie = item.split(";")[0];
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload };
}

/** REST مباشر على Supabase — للتحقق من الحالة النهائية والتنظيف. */
async function sb(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: { ...sbHeaders, ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

const stamp = Date.now();
let productSlug = "";
const orderIds = [];
let productId = null;
let originalBank = null;

async function productStock() {
  const row = (await sb(`products?id=eq.${encodeURIComponent(productId)}&select=stock,colors`)).data?.[0];
  const gold = row?.colors?.find((color) => color.name === "ذهبي")?.stock;
  return { total: row?.stock, gold };
}

async function setColors(colors) {
  return call(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: { colors },
  });
}

async function createOrder({ label, payment, proof, stockReleased = false, items }) {
  const id = `QA-${stamp}-${label}`;
  orderIds.push(id);
  const total = (items || []).reduce((sum, item) => sum + item.price * item.qty, 0);
  const inserted = await sb("orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      id,
      status: "new",
      customer_name: `عميل اختبار ${label}`,
      customer_phone: "0500000000",
      subtotal: total,
      discount: 0,
      total,
      payment,
      payment_status: payment === "transfer" ? "pending" : "unpaid",
      payment_proof_path: proof ? `qa/${id}.jpg` : null,
      payment_proof_at: proof ? new Date().toISOString() : null,
      stock_released: stockReleased,
      items: items || [],
    },
  });

  if (inserted.status !== 201) {
    throw new Error(`create order ${label} failed: ${inserted.status} ${JSON.stringify(inserted.data)}`);
  }
  return id;
}

async function cleanup() {
  const out = {};
  if (orderIds.length) {
    out.orders = (await sb(`orders?id=in.(${orderIds.map(encodeURIComponent).join(",")})`, { method: "DELETE" })).status;
  }
  if (productId) {
    out.product = (await sb(`products?id=eq.${encodeURIComponent(productId)}`, { method: "DELETE" })).status;
  }
  if (originalBank) {
    out.settings = (
      await sb("settings?key=eq.bank_transfer", {
        method: "PATCH",
        body: { value: originalBank },
      })
    ).status;
  }
  return out;
}

try {
  const login = await call("/api/auth/login", {
    method: "POST",
    body: adminCredentials(),
  });
  check("login", login.status === 200, JSON.stringify(login.payload).slice(0, 200));

  /* ── منتج مؤقت بمخزون لوني ─────────────────────────── */
  const product = await call("/api/products", {
    method: "POST",
    body: {
      name: `منتج اختبار الطلبات ${stamp}`,
      subtitle: "اختبار قبول",
      category: "accessories-1",
      gender: "unisex",
      artwork: "necklace",
      price: 40,
      colors: [{ name: "ذهبي", hex: "#d4a857", stock: 3 }],
      tone: "#d4a857",
      active: true,
    },
  });
  const created = product.payload?.data?.product;
  productId = created?.id ?? null;
  productSlug = created?.slug ?? "";
  check(
    "create temp product (3 in gold)",
    product.status === 201 && created?.stock === 3 && created?.colors?.[0]?.stock === 3,
    JSON.stringify(product.payload).slice(0, 250)
  );

  const item = {
    productId,
    name: `منتج اختبار الطلبات ${stamp}`,
    slug: productSlug,
    price: 40,
    qty: 2,
    color: "ذهبي",
  };

  /* ── 1) اعتماد الإيصال ─────────────────────────────── */
  const approveId = await createOrder({ label: "approve", payment: "transfer", proof: true });
  const approve = await call(`/api/orders/${encodeURIComponent(approveId)}`, {
    method: "PATCH",
    body: { paymentStatus: "paid" },
  });
  check(
    "approve transfer proof -> paid + confirmed",
    approve.status === 200 &&
      approve.payload?.data?.order?.paymentStatus === "paid" &&
      approve.payload?.data?.order?.status === "confirmed" &&
      !approve.payload?.data?.order?.paymentReviewNote,
    JSON.stringify(approve.payload).slice(0, 300)
  );

  const completed = await call(`/api/orders/${encodeURIComponent(approveId)}`, {
    method: "PATCH",
    body: { status: "completed" },
  });
  check(
    "status transition confirmed->completed",
    completed.status === 200 &&
      completed.payload?.data?.order?.status === "completed"
  );

  /* ── 2) رفض الإيصال ────────────────────────────────── */
  const rejectId = await createOrder({ label: "reject", payment: "transfer", proof: true });
  const reject = await call(`/api/orders/${encodeURIComponent(rejectId)}`, {
    method: "PATCH",
    body: { paymentStatus: "failed" },
  });
  check(
    "reject proof -> failed + note + status unchanged",
    reject.status === 200 &&
      reject.payload?.data?.order?.paymentStatus === "failed" &&
      reject.payload?.data?.order?.status === "new" &&
      Boolean(reject.payload?.data?.order?.paymentReviewNote),
    JSON.stringify(reject.payload).slice(0, 300)
  );

  const reapprove = await call(`/api/orders/${encodeURIComponent(rejectId)}`, {
    method: "PATCH",
    body: { paymentStatus: "paid", reviewNote: "تم التحقق يدوياً" },
  });
  check(
    "re-approve rejected proof -> paid + note cleared",
    reapprove.status === 200 &&
      reapprove.payload?.data?.order?.paymentStatus === "paid" &&
      !reapprove.payload?.data?.order?.paymentReviewNote,
    JSON.stringify(reapprove.payload).slice(0, 250)
  );

  /* ── 3) اعتماد بلا إيصال ───────────────────────────── */
  const noProofId = await createOrder({ label: "noproof", payment: "transfer", proof: false });
  const noProof = await call(`/api/orders/${encodeURIComponent(noProofId)}`, {
    method: "PATCH",
    body: { paymentStatus: "paid" },
  });
  const noProofRow = (await sb(`orders?id=eq.${encodeURIComponent(noProofId)}&select=payment_status,status`)).data?.[0];
  check(
    "approve without proof -> 409 and unchanged",
    noProof.status === 409 &&
      noProofRow?.payment_status === "pending" &&
      noProofRow?.status === "new",
    `${noProof.status} ${JSON.stringify(noProof.payload)}`
  );

  /* ── 4) قواعد غير صحيحة ────────────────────────────── */
  const codId = await createOrder({ label: "cod", payment: "cod", proof: false });
  const codReject = await call(`/api/orders/${encodeURIComponent(codId)}`, {
    method: "PATCH",
    body: { paymentStatus: "failed" },
  });
  check(
    "proof review on non-transfer -> 400",
    codReject.status === 400,
    JSON.stringify(codReject.payload).slice(0, 200)
  );

  const badStatus = await call(`/api/orders/${encodeURIComponent(approveId)}`, {
    method: "PATCH",
    body: { status: "teleported" },
  });
  const emptyPatch = await call(`/api/orders/${encodeURIComponent(approveId)}`, {
    method: "PATCH",
    body: {},
  });
  check("unknown status -> 400", badStatus.status === 400);
  check("empty patch -> 400", emptyPatch.status === 400);
  check(
    "unknown order -> 404",
    (await call("/api/orders/does-not-exist-qa", { method: "PATCH", body: { status: "confirmed" } })).status === 404
  );

  /* ── 5) الإلغاء وإعادة الفتح والمخزون ──────────────── */
  const stockId = await createOrder({ label: "stock", payment: "cod", proof: false, items: [item] });
  const reserve = await sb("rpc/reserve_stock", {
    method: "POST",
    body: { lines: [{ productId, qty: 2, color: "ذهبي" }] },
  });
  const afterReserve = await productStock();
  check(
    "reserve before cancel: 3 -> 1",
    reserve.status === 204 && afterReserve.total === 1 && afterReserve.gold === 1,
    JSON.stringify(afterReserve)
  );

  const cancel = await call(`/api/orders/${encodeURIComponent(stockId)}`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  const afterCancel = await productStock();
  check(
    "cancel releases stock: 1 -> 3",
    cancel.status === 200 &&
      cancel.payload?.data?.order?.status === "cancelled" &&
      afterCancel.total === 3 &&
      afterCancel.gold === 3,
    JSON.stringify({ order: cancel.payload?.data?.order?.status, afterCancel })
  );

  const colorOnlyOne = await setColors([{ name: "ذهبي", hex: "#d4a857", stock: 1 }]);
  const reopenFail = await call(`/api/orders/${encodeURIComponent(stockId)}`, {
    method: "PATCH",
    body: { status: "confirmed" },
  });
  const stillCancelled = (await sb(`orders?id=eq.${encodeURIComponent(stockId)}&select=status,stock_released`)).data?.[0];
  check(
    "reopen with insufficient stock -> 409 + stays cancelled",
    colorOnlyOne.status === 200 &&
      reopenFail.status === 409 &&
      stillCancelled?.status === "cancelled" &&
      stillCancelled?.stock_released === true,
    `${reopenFail.status} ${JSON.stringify(reopenFail.payload)}`
  );

  const restoreColors = await setColors([{ name: "ذهبي", hex: "#d4a857", stock: 3 }]);
  const reopen = await call(`/api/orders/${encodeURIComponent(stockId)}`, {
    method: "PATCH",
    body: { status: "confirmed" },
  });
  const afterReopen = await productStock();
  check(
    "reopen reserves stock: 3 -> 1",
    restoreColors.status === 200 &&
      reopen.status === 200 &&
      reopen.payload?.data?.reopened === true &&
      afterReopen.total === 1 &&
      afterReopen.gold === 1,
    JSON.stringify({ reopened: reopen.payload?.data?.reopened, afterReopen })
  );

  const finalCancel = await call(`/api/orders/${encodeURIComponent(stockId)}`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  const afterFinal = await productStock();
  check(
    "final cancel restores stock",
    finalCancel.status === 200 && afterFinal.total === 3 && afterFinal.gold === 3,
    JSON.stringify(afterFinal)
  );

  /* ── 6) الإعدادات البنكية ──────────────────────────── */
  const bankBefore = await call("/api/settings/bank");
  originalBank = bankBefore.payload?.data?.bank ?? null;
  check("read bank settings", bankBefore.status === 200 && originalBank !== null);

  const testBank = {
    bankName: "بنك اختبار",
    accountName: "حساب اختبار",
    iban: "SA1234567890",
    note: "ملاحظة اختبار",
  };
  const saved = await call("/api/settings/bank", { method: "PUT", body: testBank });
  const bankAfter = await call("/api/settings/bank");
  check(
    "save bank settings persists",
    saved.status === 200 &&
      bankAfter.payload?.data?.bank?.bankName === testBank.bankName &&
      bankAfter.payload?.data?.bank?.iban === testBank.iban,
    JSON.stringify(bankAfter.payload).slice(0, 250)
  );

  const badIban = await call("/api/settings/bank", {
    method: "PUT",
    body: { ...testBank, iban: "SA-12 34" },
  });
  check("invalid iban -> 400", badIban.status === 400, JSON.stringify(badIban.payload).slice(0, 200));

  const missingBank = await call("/api/settings/bank", {
    method: "PUT",
    body: { bankName: "", accountName: "", iban: "" },
  });
  check("missing bank name -> 400", missingBank.status === 400);

  /* ── 7) المتجر يستقبل التغييرات ─────────────────────── */
  try {
    const storeRes = await fetch(`${store}/orders`, { redirect: "manual" });
    check("store reachable for revalidation", storeRes.status < 500, `status=${storeRes.status}`);
  } catch (error) {
    check("store reachable for revalidation", false, String(error?.message ?? error));
  }

  /* ── 8) صفحات المدير ───────────────────────────────── */
  const ordersPage = await call("/orders");
  const settingsPage = await call("/settings");
  check(
    "manager orders + settings pages render",
    ordersPage.status === 200 && settingsPage.status === 200
  );
} catch (error) {
  check("unexpected error", false, String(error?.stack ?? error));
} finally {
  const cleaned = await cleanup();
  const failed = results.filter((item) => !item.ok);

  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}${item.ok ? "" : `  ::  ${item.extra}`}`);
  }
  console.log(`\ncleanup: ${JSON.stringify(cleaned)}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
