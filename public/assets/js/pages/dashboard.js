import {
  api,
  dom,
  fmt,
  ui,
  orderStatusLabel,
  ORDER_STATUS_TONE,
} from "../shared.js";

/**
 * الصفحة الرئيسية: مؤشرات + آخر الطلبات + إيصالات بانتظار المراجعة.
 * كل النصوص القادمة من القاعدة تمر عبر escapeHtml قبل الحقن.
 */

const { $, escapeHtml, setBusy } = dom;

const dateBox = $("#dash-date");
const refreshButton = $("#dash-refresh");
const recentBody = $("#recent-body");
const proofsList = $("#proofs-list");

function todayLabel() {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function setStat(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function statusBadge(value) {
  const tone = ORDER_STATUS_TONE[value] || "muted";
  return `<span class="m-badge m-badge--${tone}">${escapeHtml(orderStatusLabel(value))}</span>`;
}

function renderRecent(orders) {
  if (!recentBody) return;

  if (!orders.length) {
    recentBody.innerHTML = `<tr><td colspan="5" class="m-table__empty">لا توجد طلبات بعد</td></tr>`;
    return;
  }

  recentBody.innerHTML = orders
    .map((order) => {
      const id = escapeHtml(order.id);
      const displayId = escapeHtml(fmt.shortId(order.id));
      return `
        <tr data-order="${id}" tabindex="0">
          <td>
            <span class="m-cell-id">#${displayId}</span>
            <span class="m-cell-sub">${escapeHtml(fmt.date(order.createdAt))}</span>
          </td>
          <td>
            ${escapeHtml(order.customer.name || "—")}
          </td>
          <td class="m-cell-money">${escapeHtml(fmt.money(order.total))}</td>
          <td>${statusBadge(order.status)}</td>
          <td>${escapeHtml(fmt.timeAgo(order.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderProofs(orders) {
  if (!proofsList) return;

  if (!orders.length) {
    proofsList.innerHTML = `<li class="m-proof-list__empty">لا توجد إيصالات بانتظار المراجعة</li>`;
    return;
  }

  proofsList.innerHTML = orders
    .map((order) => {
      const id = encodeURIComponent(order.id);
      return `
        <li>
          <a class="m-proof-item" href="/orders?order=${id}">
            <span class="m-proof-item__icon" aria-hidden="true">◌</span>
            <span class="m-proof-item__text">
              <strong>${escapeHtml(order.customer.name || "عميل")}</strong>
              <small>${escapeHtml(fmt.timeAgo(order.paymentProofAt || order.createdAt))}</small>
            </span>
            <span class="m-proof-item__amount">${escapeHtml(fmt.money(order.total))}</span>
            <span class="m-proof-item__chevron" aria-hidden="true">‹</span>
          </a>
        </li>
      `;
    })
    .join("");
}

async function load() {
  setBusy(refreshButton, true, "جارٍ التحديث…");

  try {
    const data = await api.get("/api/dashboard");

    setStat("#stat-total", fmt.num(data.stats.totalOrders));
    setStat("#stat-today", fmt.num(data.stats.todayOrders));
    setStat("#stat-new", fmt.num(data.stats.newOrders));
    setStat("#stat-review", fmt.num(data.stats.pendingPayment));
    setStat("#stat-reviews", fmt.num(data.stats.pendingReviews));
    setStat("#stat-value", fmt.money(data.stats.confirmedValue));

    renderRecent(data.recentOrders);
    renderProofs(data.pendingProofs);
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل المؤشرات", "error");
    if (recentBody) {
      recentBody.innerHTML = `<tr><td colspan="5" class="m-table__empty">تعذّر تحميل الطلبات</td></tr>`;
    }
    if (proofsList) {
      proofsList.innerHTML = `<li class="m-proof-list__empty">تعذّر تحميل الإيصالات</li>`;
    }
  } finally {
    setBusy(refreshButton, false);
  }
}

if (dateBox) dateBox.textContent = todayLabel();

refreshButton?.addEventListener("click", load);

recentBody?.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-order]");
  if (!row) return;
  location.href = `/orders?order=${encodeURIComponent(row.dataset.order)}`;
});

recentBody?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("tr[data-order]");
  if (!row) return;
  event.preventDefault();
  location.href = `/orders?order=${encodeURIComponent(row.dataset.order)}`;
});

load();
