import {
  api,
  dom,
  fmt,
  ui,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
} from "../shared.js";

/**
 * ملف العميل: يحمّل بياناته وطلباته من الخادم، ويعرض الملاحظة الداخلية
 * القابلة للحفظ. لا تُدار كلمة المرور من اللوحة.
 */

const { $, escapeHtml, setBusy } = dom;

const content = $("#content");
const customerId = content?.dataset.customerId || "";

const noteForm = $("#customer-note-form");
const noteInput = $("#customer-note");
const noteError = $("#customer-note-error");
const noteSuccess = $("#customer-note-success");
const noteSave = $("#customer-note-save");

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function statusBadge(value) {
  const tone = ORDER_STATUS_TONE[value] || "muted";
  return `<span class="m-badge m-badge--${tone}">${escapeHtml(orderStatusLabel(value))}</span>`;
}

function paymentBadge(value) {
  const tone = PAYMENT_STATUS_TONE[value] || "muted";
  return `<span class="m-badge m-badge--${tone}">${escapeHtml(paymentStatusLabel(value))}</span>`;
}

function renderOrders(orders) {
  const tbody = $("#customer-orders");
  if (!tbody) return;

  if (!orders.length) {
    ui.emptyRow(tbody, 6, "لا توجد طلبات لهذا العميل بعد");
    return;
  }

  tbody.innerHTML = orders
    .map((order) => {
      const id = escapeHtml(order.id);
      const units = order.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      return `
        <tr data-order="${id}" tabindex="0" style="cursor:pointer">
          <td>
            <span class="m-cell-id">#${escapeHtml(fmt.shortId(order.id))}</span>
          </td>
          <td class="m-cell-muted">${escapeHtml(fmt.dateTime(order.createdAt))}</td>
          <td>${escapeHtml(fmt.num(units))}</td>
          <td class="m-cell-money">${escapeHtml(fmt.money(order.total))}</td>
          <td>
            <span class="m-cell-sub">${escapeHtml(paymentMethodLabel(order.payment))}</span>
            ${paymentBadge(order.paymentStatus)}
          </td>
          <td>${statusBadge(order.status)}</td>
        </tr>
      `;
    })
    .join("");
}

function render(data) {
  const { customer, stats, orders } = data;

  setText("#customer-name", customer.name || "بدون اسم");
  setText("#customer-email", customer.email || "—");
  setText("#customer-phone", customer.phone || "—");
  setText("#customer-provider", customer.provider || "email");
  setText("#customer-joined", fmt.date(customer.joinedAt));
  setText("#customer-first-order", stats.firstOrderAt ? fmt.date(stats.firstOrderAt) : "—");
  setText("#customer-last-order", stats.lastOrderAt ? fmt.timeAgo(stats.lastOrderAt) : "—");

  setText("#customer-stat-orders", fmt.num(stats.ordersCount));
  setText("#customer-stat-spend", fmt.money(stats.spend));
  setText("#customer-stat-average", fmt.money(stats.averageOrder));
  setText("#customer-stat-units", fmt.num(stats.units));

  const count = $("#customer-orders-count");
  if (count) {
    count.textContent = orders.length
      ? `${fmt.num(orders.length)} طلب — ${fmt.num(stats.paidCount)} مؤكد/مكتمل`
      : "لا طلبات بعد";
  }

  const whatsapp = $("#customer-whatsapp");
  const call = $("#customer-call");
  if (customer.phone) {
    whatsapp.href = fmt.whatsappHref(
      customer.phone,
      `مرحباً ${customer.name || "عميلنا"}، نتواصل معك من متجر ستور.`
    );
    call.href = fmt.telHref(customer.phone);
    whatsapp.hidden = false;
    call.hidden = false;
  } else {
    whatsapp.hidden = true;
    call.hidden = true;
  }

  if (noteInput) noteInput.value = customer.adminNote || "";

  renderOrders(orders);
}

async function load() {
  if (!customerId) return;
  try {
    const data = await api.get(`/api/customers/${encodeURIComponent(customerId)}`);
    render(data);
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل ملف العميل", "error");
  }
}

/* ── حفظ الملاحظة الداخلية ─────────────────────────────── */
function clearNoteMessages() {
  if (noteError) noteError.hidden = true;
  if (noteSuccess) noteSuccess.hidden = true;
}

noteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!customerId) return;

  clearNoteMessages();
  setBusy(noteSave, true, "جارٍ الحفظ…");

  try {
    const value = noteInput?.value.trim() || "";
    await api.patch(`/api/customers/${encodeURIComponent(customerId)}`, {
      adminNote: value,
    });
    if (noteSuccess) {
      noteSuccess.textContent = "تم حفظ الملاحظة الداخلية";
      noteSuccess.hidden = false;
    }
  } catch (error) {
    if (noteError) {
      noteError.textContent = error.message || "تعذّر حفظ الملاحظة";
      noteError.hidden = false;
    }
  } finally {
    setBusy(noteSave, false);
  }
});

/* ── فتح الطلب من الجدول ───────────────────────────────── */
$("#customer-orders")?.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-order]");
  if (!row) return;
  location.href = `/orders?order=${encodeURIComponent(row.dataset.order)}`;
});

$("#customer-orders")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("tr[data-order]");
  if (!row) return;
  event.preventDefault();
  location.href = `/orders?order=${encodeURIComponent(row.dataset.order)}`;
});

load();
