import {
  api,
  dom,
  fmt,
  ui,
  table,
  orderStatusLabel,
  paymentStatusLabel,
  paymentMethodLabel,
  stockStateLabel,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  STOCK_STATE_TONE,
} from "../shared.js";

/**
 * صفحة الطلبات: بحث وفلاتر، جدول بترقيم صفحات، ونافذة تفاصيل
 * تجمع تغيير الحالة، تأكيد الطلب وخصم المخزون، ومراجعة الإيصال.
 */

const { $, escapeHtml, setBusy, debounce } = dom;

const PER_PAGE = 25;

const searchInput = $("#orders-search");
const statusFilter = $("#filter-status");
const paymentFilter = $("#filter-payment");
const paymentStatusFilter = $("#filter-payment-status");
const stockFilter = $("#filter-stock");
const fromFilter = $("#filter-from");
const toFilter = $("#filter-to");
const refreshButton = $("#orders-refresh");
const tbody = $("#orders-body");
const countLabel = $("#orders-count");
const pagination = $("#orders-pagination");

const dialog = $("#order-dialog");
const proofDialog = $("#proof-dialog");
const proofImage = $("#proof-image");
const proofFrame = $("#proof-frame");

const state = {
  orders: [],
  page: 1,
  openOrder: null,
  firstLoad: true,
};

/* ── أدوات عرض ─────────────────────────────────────────── */

function statusBadge(value) {
  const tone = ORDER_STATUS_TONE[value] || "muted";
  return `<span class="m-badge m-badge--${tone}">${escapeHtml(orderStatusLabel(value))}</span>`;
}

function paymentBadge(value) {
  const tone = PAYMENT_STATUS_TONE[value] || "muted";
  return `<span class="m-badge m-badge--${tone}">${escapeHtml(paymentStatusLabel(value))}</span>`;
}

function stockBadge(value) {
  const state = value || "none";
  const tone = STOCK_STATE_TONE[state] || "muted";
  return `<span class="m-badge m-badge--${tone}">${escapeHtml(stockStateLabel(state))}</span>`;
}

function shortId(id) {
  return fmt.shortId(id);
}

/* ── الجدول ────────────────────────────────────────────── */

function renderTable() {
  if (!tbody) return;

  if (!state.orders.length) {
    ui.emptyRow(tbody, 8, "لا توجد طلبات مطابقة لهذه الفلاتر");
    if (pagination) pagination.innerHTML = "";
  } else {
    const slice = table.paginate(state.orders, state.page, PER_PAGE);
    state.page = slice.page;

    tbody.innerHTML = slice.items
      .map((order) => {
        const id = escapeHtml(order.id);
        const lines = order.items.length;
        const units = order.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
        return `
          <tr data-order="${id}" tabindex="0">
            <td>
              <span class="m-cell-id">#${escapeHtml(shortId(order.id))}</span>
              <span class="m-cell-sub">${escapeHtml(fmt.dateTime(order.createdAt))}</span>
            </td>
            <td>
              ${escapeHtml(order.customer.name || "—")}
              <span class="m-cell-sub">${escapeHtml(order.customer.phone || "")}</span>
            </td>
            <td>
              <span class="m-cell-sub">${escapeHtml(fmt.num(lines))} صنف</span>
              <span class="m-cell-sub">${escapeHtml(fmt.num(units))} قطعة</span>
            </td>
            <td class="m-cell-money">${escapeHtml(fmt.money(order.total))}</td>
            <td>
              <span class="m-cell-sub">${escapeHtml(paymentMethodLabel(order.payment))}</span>
              ${paymentBadge(order.paymentStatus)}
            </td>
            <td>${stockBadge(order.stockState)}</td>
            <td>${statusBadge(order.status)}</td>
            <td><button type="button" class="m-order-open" data-open="${id}">عرض</button></td>
          </tr>
        `;
      })
      .join("");

    table.renderPagination(pagination, {
      page: slice.page,
      pages: slice.pages,
      onChange: (page) => {
        state.page = page;
        renderTable();
      },
    });
  }

  if (countLabel) {
    countLabel.textContent = state.orders.length
      ? `${fmt.num(state.orders.length)} طلب — صفحة ${fmt.num(state.page)}`
      : "لا توجد طلبات";
  }
}

/* ── التحميل ───────────────────────────────────────────── */

function currentQuery() {
  const params = new URLSearchParams();

  const query = searchInput?.value.trim();
  if (query) params.set("query", query);
  if (statusFilter?.value) params.set("status", statusFilter.value);
  if (paymentFilter?.value) params.set("payment", paymentFilter.value);
  if (paymentStatusFilter?.value) params.set("paymentStatus", paymentStatusFilter.value);
  if (stockFilter?.value) params.set("stockState", stockFilter.value);
  if (fromFilter?.value) params.set("from", fromFilter.value);
  if (toFilter?.value) params.set("to", toFilter.value);

  return params;
}

async function load({ keepPage = false } = {}) {
  setBusy(refreshButton, true, "جارٍ التحديث…");

  if (state.firstLoad) {
    ui.skeletonRows(tbody, 6);
    state.firstLoad = false;
  }

  try {
    const params = currentQuery();
    const data = await api.get(`/api/orders?${params.toString()}`);

    state.orders = data.orders;
    if (!keepPage) state.page = 1;

    renderTable();
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل الطلبات", "error");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="m-table__empty">تعذّر تحميل الطلبات</td></tr>`;
    }
  } finally {
    setBusy(refreshButton, false);
  }
}

/* ── تفاصيل الطلب ──────────────────────────────────────── */

function fillBadges(order) {
  const badges = [
    statusBadge(order.status),
    paymentBadge(order.paymentStatus),
    stockBadge(order.stockState),
    `<span class="m-badge">${escapeHtml(paymentMethodLabel(order.payment))}</span>`,
  ];

  const box = $("#order-badges");
  if (box) box.innerHTML = badges.join("");
}

function fillItems(order) {
  const list = $("#order-items");
  if (!list) return;

  list.innerHTML = order.items
    .map((item) => {
      const variant = [item.option, item.color].filter(Boolean).join(" · ");
      return `
        <li class="m-item">
          <span class="m-item__name">
            <strong>${escapeHtml(item.name || "منتج")}</strong>
            <small>${escapeHtml(variant || "—")}</small>
          </span>
          <span class="m-item__price">
            <span>${escapeHtml(fmt.num(item.qty || 1))} ×</span>
            ${escapeHtml(fmt.money((item.price || 0) * (item.qty || 1)))}
          </span>
        </li>
      `;
    })
    .join("");

  const totals = [
    ["المجموع الفرعي", fmt.money(order.subtotal)],
    order.discount > 0 ? ["الخصم", `− ${fmt.money(order.discount)}`] : null,
    ["الإجمالي", fmt.money(order.total)],
  ].filter(Boolean);

  const totalsBox = $("#order-totals");
  if (totalsBox) {
    totalsBox.innerHTML = totals
      .map(([label, value], index) => {
        const isTotal = index === totals.length - 1;
        return `<div class="${isTotal ? "is-total" : ""}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
      })
      .join("");
  }
}

function fillDialog(order) {
  const name = order.customer.name || "عميل";

  $("#order-id").textContent = `#${shortId(order.id)} · ${fmt.dateTime(order.createdAt)}`;
  $("#order-customer").textContent = name;

  fillBadges(order);

  $("#order-phone").textContent = order.customer.phone || "—";
  $("#order-email").textContent = order.customerEmail || "—";
  $("#order-notes").textContent = order.customer.notes || "—";

  const call = $("#order-call");
  const whatsapp = $("#order-whatsapp");
  if (order.customer.phone) {
    call.href = fmt.telHref(order.customer.phone);
    whatsapp.href = fmt.whatsappHref(
      order.customer.phone,
      orderMessage(order)
    );
    call.hidden = false;
    whatsapp.hidden = false;
  } else {
    call.hidden = true;
    whatsapp.hidden = true;
  }

  $("#order-payment").textContent = paymentMethodLabel(order.payment);
  $("#order-payment-status").textContent = paymentStatusLabel(order.paymentStatus);
  $("#order-stock-state").textContent = stockStateLabel(order.stockState);
  $("#order-proof-time").textContent = order.paymentProofAt
    ? fmt.dateTime(order.paymentProofAt)
    : "لم يُرفع إيصال";
  $("#order-review-note").textContent = order.paymentReviewNote || "—";

  const proofBox = $("#order-proof");
  if (proofBox) proofBox.hidden = !order.paymentProofPath;

  fillItems(order);

  const statusSelect = $("#order-status");
  if (statusSelect) statusSelect.value = order.status;

  const note = $("#order-note");
  if (note) note.value = order.paymentReviewNote || "";

  // «تأكيد وخصم المخزون» للطلب الجديد فقط، وغير المخصوم مسبقاً.
  const confirmButton = $("#order-confirm");
  if (confirmButton) {
    const canConfirm = order.status === "new" && order.stockState !== "reserved";
    confirmButton.hidden = !canConfirm;
  }

  // مراجعة الإيصال متاحة للدفع المسبق (تحويل/محفظة) فقط.
  const isPrepaid = order.payment === "transfer" || order.payment === "wallet";
  document.querySelectorAll("[data-payment]").forEach((button) => {
    button.hidden = !isPrepaid;
    button.disabled = !isPrepaid || !order.paymentProofPath;
  });

  const hint = $("#order-hint");
  if (hint) {
    hint.textContent = isPrepaid
      ? order.paymentProofPath
        ? "اعتماد الإيصال يؤكد الطلب الجديد ويخصم المخزون تلقائياً. رفضه يسجّل الملاحظة أعلاه."
        : "لم يرفع العميل إيصالاً بعد؛ لا يمكن الاعتماد أو الرفض قبل رفعه."
      : "طلبات الدفع عند الاستلام لا تحتاج مراجعة إيصال. استخدم «تأكيد وخصم المخزون» بعد التواصل مع العميل.";
  }
}

/** رسالة واتساب جاهزة: الطلب وقطعُه والإجمالي وموعد الاستلام. */
function orderMessage(order) {
  const name = order.customer.name || "عميلنا";
  const lines = order.items
    .map((item) => `• ${item.name || "منتج"} ×${Number(item.qty) || 1}`)
    .join("\n");

  return [
    `مرحباً ${name}، بخصوص طلبك #${shortId(order.id)} من ستور:`,
    lines,
    `الإجمالي: ${fmt.money(order.total)}`,
    "نرجو تأكيد الطلب وتحديد موعد الاستلام من المتجر.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function openDetail(id) {
  if (!id) return;

  try {
    const data = await api.get(`/api/orders/${encodeURIComponent(id)}`);
    state.openOrder = data.order;
    fillDialog(data.order);
    ui.openDialog(dialog);
  } catch (error) {
    ui.toast(error.message || "تعذّر فتح الطلب", "error");
  }
}

function openProof() {
  if (!state.openOrder?.paymentProofPath) return;

  const source = `/api/orders/${encodeURIComponent(state.openOrder.id)}/proof?t=${Date.now()}`;

  if (state.openOrder.paymentProofIsPdf) {
    proofFrame.src = source;
    proofFrame.hidden = false;
    proofImage.hidden = true;
    proofImage.removeAttribute("src");
  } else {
    proofImage.src = source;
    proofImage.hidden = false;
    proofFrame.hidden = true;
    proofFrame.removeAttribute("src");
  }

  ui.openDialog(proofDialog);
}

/* ── التعديلات ─────────────────────────────────────────── */

async function applyPatch(payload, successMessage) {
  if (!state.openOrder) return;

  const data = await api.patch(
    `/api/orders/${encodeURIComponent(state.openOrder.id)}`,
    payload
  );

  state.openOrder = data.order;
  fillDialog(data.order);
  ui.toast(successMessage);

  await load({ keepPage: true });
}

/** تأكيد الطلب وخصم المخزون — ذرّي على الخادم. */
async function confirmOrder() {
  if (!state.openOrder) return;

  const confirmed = await ui.confirmAction({
    title: "تأكيد الطلب وخصم المخزون",
    message:
      "سيُخصم المخزون لهذا الطلب ويصبح «مؤكداً». إن نقصت أي قطعة لن يُخصم شيء ويبقى الطلب جديداً.",
    confirmText: "تأكيد وخصم",
  });
  if (!confirmed) return;

  const button = $("#order-confirm");
  setBusy(button, true, "جارٍ التأكيد…");

  try {
    const data = await api.post(
      `/api/orders/${encodeURIComponent(state.openOrder.id)}/confirm`
    );
    state.openOrder = data.order;
    fillDialog(data.order);
    ui.toast("تم تأكيد الطلب وخصم المخزون");
    await load({ keepPage: true });
  } catch (error) {
    ui.toast(error.message || "تعذّر تأكيد الطلب", "error");
  } finally {
    setBusy(button, false);
  }
}

async function saveStatus() {  if (!state.openOrder) return;

  const statusSelect = $("#order-status");
  const nextStatus = statusSelect?.value;

  if (!nextStatus || nextStatus === state.openOrder.status) {
    ui.toast("لا يوجد تغيير في حالة الطلب", "info");
    return;
  }

  if (nextStatus === "cancelled") {
    const confirmed = await ui.confirmAction({
      title: "إلغاء الطلب",
      message: "سيُحرَّر المخزون المرتبط بهذا الطلب. هل تريد المتابعة؟",
      confirmText: "إلغاء الطلب",
      danger: true,
    });
    if (!confirmed) return;
  }

  const button = $("#order-save");
  setBusy(button, true, "جارٍ الحفظ…");

  try {
    await applyPatch({ status: nextStatus }, "تم تحديث حالة الطلب");
  } catch (error) {
    ui.toast(error.message || "تعذّر تحديث الطلب", "error");
  } finally {
    setBusy(button, false);
  }
}

async function reviewPayment(paymentStatus) {
  if (!state.openOrder) return;

  const note = $("#order-note")?.value.trim() || "";

  if (paymentStatus === "failed" && !note) {
    ui.toast("اكتب ملاحظة توضح سبب رفض الإيصال", "error");
    $("#order-note")?.focus();
    return;
  }

  const confirmed = await ui.confirmAction({
    title: paymentStatus === "paid" ? "اعتماد الإيصال" : "رفض الإيصال",
    message:
      paymentStatus === "paid"
        ? "سيُسجَّل الطلب مدفوعاً، وإن كان جديداً سيُؤكَّد تلقائياً."
        : "سيُسجَّل الدفع مرفوضاً مع الملاحظة المكتوبة.",
    confirmText: paymentStatus === "paid" ? "اعتماد" : "رفض",
    danger: paymentStatus === "failed",
  });

  if (!confirmed) return;

  try {
    await applyPatch(
      { paymentStatus, reviewNote: note },
      paymentStatus === "paid" ? "تم اعتماد الإيصال" : "تم رفض الإيصال"
    );
  } catch (error) {
    ui.toast(error.message || "تعذّرت مراجعة الإيصال", "error");
  }
}

/* ── الأحداث ───────────────────────────────────────────── */

tbody?.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-order]");
  if (!row) return;
  openDetail(row.dataset.order);
});

tbody?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("tr[data-order]");
  if (!row) return;
  event.preventDefault();
  openDetail(row.dataset.order);
});

refreshButton?.addEventListener("click", () => load({ keepPage: true }));

searchInput?.addEventListener(
  "input",
  debounce(() => load(), 320)
);

[statusFilter, paymentFilter, paymentStatusFilter, stockFilter].forEach((select) => {
  select?.addEventListener("change", () => load());
});

[fromFilter, toFilter].forEach((input) => {
  input?.addEventListener("change", () => load());
});

$("#order-save")?.addEventListener("click", saveStatus);
$("#order-confirm")?.addEventListener("click", confirmOrder);

document.querySelectorAll("[data-payment]").forEach((button) => {
  button.addEventListener("click", () => reviewPayment(button.dataset.payment));
});

$("#order-proof-open")?.addEventListener("click", openProof);

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => ui.closeDialog(button.closest("dialog")));
});

[dialog, proofDialog].forEach((element) => {
  element?.addEventListener("click", (event) => {
    if (event.target === element) ui.closeDialog(element);
  });
});

proofDialog?.addEventListener("close", () => {
  proofImage?.removeAttribute("src");
  proofFrame?.removeAttribute("src");
});

/* ── الإقلاع ───────────────────────────────────────────── */

const params = new URLSearchParams(location.search);
if (statusFilter && params.get("status")) statusFilter.value = params.get("status");
if (paymentFilter && params.get("payment")) paymentFilter.value = params.get("payment");
if (paymentStatusFilter && params.get("paymentStatus")) {
  paymentStatusFilter.value = params.get("paymentStatus");
}
if (stockFilter && params.get("stockState")) stockFilter.value = params.get("stockState");
if (fromFilter && params.get("from")) fromFilter.value = params.get("from");
if (toFilter && params.get("to")) toFilter.value = params.get("to");
if (searchInput && params.get("query")) searchInput.value = params.get("query");

const initialOrder = params.get("order");

load().then(() => {
  if (initialOrder) openDetail(initialOrder);
});
