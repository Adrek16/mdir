import { api, dom, fmt, ui } from "../shared.js";

/**
 * شاشة التقارير: تحمّل التجميع من الخادم، ترسم المبيعات كـ SVG،
 * وتصدّر كل جدول كـ CSV بترميز UTF-8 مع BOM (ليقرأه Excel بالعربية).
 */

const { $, escapeHtml, setBusy } = dom;

const periodSelect = $("#report-period");
const fromInput = $("#report-from");
const toInput = $("#report-to");
const fromWrap = $("#report-from-wrap");
const toWrap = $("#report-to-wrap");
const applyButton = $("#report-apply");
const refreshButton = $("#report-refresh");
const printButton = $("#report-print");

const state = {
  data: null,
};

/* ── المؤشرات ─────────────────────────────────────────────── */
function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function renderKpis(kpi) {
  setText("#kpi-revenue", fmt.money(kpi.revenue));
  setText("#kpi-orders", fmt.num(kpi.orders));
  setText("#kpi-sales-orders", fmt.num(kpi.salesOrders));
  setText("#kpi-average", fmt.money(kpi.avgOrder));
  setText("#kpi-units", fmt.num(kpi.units));
  setText("#kpi-cancel", `${fmt.num(kpi.cancelRate)}٪`);
  setText("#kpi-new", fmt.num(kpi.newCustomers));
  setText("#kpi-repeat", fmt.num(kpi.repeatCustomers));
}

/* ── الرسم ────────────────────────────────────────────────── */
function niceNumber(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}م`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}ألف`;
  return fmt.num(value);
}

function renderChart(timeline) {
  const box = $("#sales-chart");
  if (!box) return;

  const hint = $("#chart-hint");

  if (!timeline.length) {
    if (hint) hint.textContent = "لا مبيعات في هذه الفترة";
    box.innerHTML = `<p class="m-chart__empty">لا بيانات في هذه الفترة</p>`;
    return;
  }

  if (hint) hint.textContent = "الإيراد اليومي — الطلبات المؤكدة والمكتملة فقط";

  const width = 760;
  const height = 260;
  const pad = { top: 16, right: 16, bottom: 34, left: 62 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(...timeline.map((point) => point.revenue), 1);
  const step = innerW / timeline.length;
  const barW = Math.max(2, Math.min(34, step * 0.62));

  const bars = timeline
    .map((point, index) => {
      const barH = Math.round((point.revenue / max) * innerH);
      const x = pad.left + step * index + (step - barW) / 2;
      const y = pad.top + innerH - barH;
      const showLabel =
        timeline.length <= 14 ||
        index === 0 ||
        index === timeline.length - 1 ||
        index === Math.floor(timeline.length / 2);

      return `
        <g class="m-chart__bar">
          <title>${escapeHtml(point.label)} — ${escapeHtml(fmt.money(point.revenue))} · ${escapeHtml(
            fmt.num(point.orders)
          )} طلب</title>
          <rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${Math.max(
            barH,
            point.revenue > 0 ? 2 : 0
          )}" rx="3"></rect>
          ${
            showLabel
              ? `<text class="m-chart__x" x="${(x + barW / 2).toFixed(1)}" y="${
                  height - 12
                }" text-anchor="middle">${escapeHtml(point.label)}</text>`
              : ""
          }
        </g>
      `;
    })
    .join("");

  const gridLines = [0, 0.5, 1]
    .map((ratio) => {
      const y = pad.top + innerH - innerH * ratio;
      return `
        <line class="m-chart__grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"></line>
        <text class="m-chart__y" x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(
          niceNumber(max * ratio)
        )}</text>
      `;
    })
    .join("");

  box.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="المبيعات عبر الزمن">
      ${gridLines}
      ${bars}
    </svg>
  `;
}

/* ── الجداول ──────────────────────────────────────────────── */
function empty(tbody, columns, message) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${columns}" class="m-table__empty">${escapeHtml(
    message
  )}</td></tr>`;
}

function renderProducts(rows) {
  const tbody = $("#report-products");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا مبيعات منتجات في هذه الفترة");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(fmt.num(row.units))}</td>
          <td class="m-cell-money">${escapeHtml(fmt.money(row.revenue))}</td>
        </tr>`
    )
    .join("");
}

function renderCategories(rows) {
  const tbody = $("#report-categories");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا مبيعات في هذه الفترة");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(fmt.num(row.units))}</td>
          <td class="m-cell-money">${escapeHtml(fmt.money(row.revenue))}</td>
        </tr>`
    )
    .join("");
}

function renderPayments(rows) {
  const tbody = $("#report-payments");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا طلبات في هذه الفترة");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.label)}</td>
          <td>${escapeHtml(fmt.num(row.count))}</td>
          <td class="m-cell-money">${escapeHtml(fmt.money(row.amount))}</td>
        </tr>`
    )
    .join("");
}

function renderCustomers(rows) {
  const tbody = $("#report-customers");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا مشترين في هذه الفترة");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>
            <span class="m-report-name">${escapeHtml(row.name)}</span>
            ${row.phone ? `<span class="m-cell-sub" dir="ltr">${escapeHtml(row.phone)}</span>` : ""}
          </td>
          <td>${escapeHtml(fmt.num(row.orders))}</td>
          <td class="m-cell-money">${escapeHtml(fmt.money(row.spend))}</td>
        </tr>`
    )
    .join("");
}

function renderStatuses(rows) {
  const tbody = $("#report-statuses");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا طلبات في هذه الفترة");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.label)}</td>
          <td>${escapeHtml(fmt.num(row.count))}</td>
          <td>${escapeHtml(fmt.num(row.share))}٪</td>
        </tr>`
    )
    .join("");
}

function renderLowStock(rows) {
  const tbody = $("#report-lowstock");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 2, "لا منتجات منخفضة المخزون");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.name)}</td>
          <td>
            <span class="m-badge ${row.stock === 0 ? "m-badge--danger" : "m-badge--warning"}">
              ${escapeHtml(fmt.num(row.stock))}
            </span>
          </td>
        </tr>`
    )
    .join("");
}

function renderTopSelling(rows) {
  const tbody = $("#report-top-selling");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا مبيعات مؤكدة بعد");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(fmt.num(row.sales))}</td>
          <td>${escapeHtml(row.rating ? row.rating.toFixed(1) : "—")}</td>
        </tr>`
    )
    .join("");
}

function renderTopRated(rows) {
  const tbody = $("#report-top-rated");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا تقييمات معتمدة بعد");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="m-report-name">${escapeHtml(row.name)}</td>
          <td>★ ${escapeHtml(row.rating.toFixed(1))}</td>
          <td>${escapeHtml(fmt.num(row.reviews))}</td>
        </tr>`
    )
    .join("");
}

function renderCancellations(rows) {
  const tbody = $("#report-cancellations");
  if (!tbody) return;
  if (!rows.length) return empty(tbody, 3, "لا إلغاءات في هذه الفترة");
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td><span class="m-cell-id">#${escapeHtml(fmt.shortId(row.id))}</span></td>
          <td>${escapeHtml(row.name)}</td>
          <td class="m-cell-muted">${escapeHtml(row.reason)}</td>
        </tr>`
    )
    .join("");
}

/* ── التصدير ──────────────────────────────────────────────── */
const EXPORTS = {
  topProducts: {
    file: "top-products",
    headers: ["المنتج", "الوحدات", "الإيراد"],
    rows: (data) => data.topProducts.map((row) => [row.name, row.units, row.revenue]),
  },
  topCategories: {
    file: "top-categories",
    headers: ["التصنيف", "الوحدات", "الإيراد"],
    rows: (data) => data.topCategories.map((row) => [row.name, row.units, row.revenue]),
  },
  payments: {
    file: "payments",
    headers: ["الطريقة", "الطلبات", "المبلغ"],
    rows: (data) => data.payments.map((row) => [row.label, row.count, row.amount]),
  },
  topCustomers: {
    file: "top-customers",
    headers: ["العميل", "الجوال", "الطلبات", "الإنفاق"],
    rows: (data) =>
      data.topCustomers.map((row) => [row.name, row.phone || "", row.orders, row.spend]),
  },
  statusBreakdown: {
    file: "statuses",
    headers: ["الحالة", "الطلبات", "النسبة"],
    rows: (data) => data.statusBreakdown.map((row) => [row.label, row.count, `${row.share}%`]),
  },
  lowStock: {
    file: "low-stock",
    headers: ["المنتج", "المتبقي"],
    rows: (data) => data.lowStock.map((row) => [row.name, row.stock]),
  },
  topSelling: {
    file: "top-selling",
    headers: ["المنتج", "المبيعات", "التقييم"],
    rows: (data) => data.topSelling.map((row) => [row.name, row.sales, row.rating]),
  },
  topRated: {
    file: "top-rated",
    headers: ["المنتج", "التقييم", "المراجعات"],
    rows: (data) => data.topRated.map((row) => [row.name, row.rating, row.reviews]),
  },
  cancellations: {
    file: "cancellations",
    headers: ["الطلب", "العميل", "السبب", "التاريخ"],
    rows: (data) =>
      data.cancellations.map((row) => [row.id, row.name, row.reason, fmt.dateTime(row.at)]),
  },
};

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(name) {
  const config = EXPORTS[name];
  if (!config || !state.data) return;

  const lines = [
    config.headers.map(escapeCsv).join(","),
    ...config.rows(state.data).map((row) => row.map(escapeCsv).join(",")),
  ];

  // BOM حتى يتعرّف Excel على UTF-8 وتظهر العربية سليمة.
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stoor-${config.file}-${state.data.period.key}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ── التحميل ──────────────────────────────────────────────── */
function syncCustomFields() {
  const custom = periodSelect?.value === "custom";
  if (fromWrap) fromWrap.hidden = !custom;
  if (toWrap) toWrap.hidden = !custom;
  if (applyButton) applyButton.hidden = !custom;
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set("period", periodSelect?.value || "30d");
  if (periodSelect?.value === "custom") {
    if (fromInput?.value) params.set("from", fromInput.value);
    if (toInput?.value) params.set("to", toInput.value);
  }
  return params;
}

function render(data) {
  state.data = data;

  const label = $("#report-period-label");
  if (label) {
    label.textContent = `${data.period.label} · ${fmt.date(
      data.period.start
    )} ← ${fmt.date(data.period.end)} · بتوقيت صنعاء`;
  }

  renderKpis(data.kpi);
  renderChart(data.timeline);
  renderProducts(data.topProducts);
  renderCategories(data.topCategories);
  renderPayments(data.payments);
  renderCustomers(data.topCustomers);
  renderStatuses(data.statusBreakdown);
  renderLowStock(data.lowStock);
  renderTopSelling(data.topSelling);
  renderTopRated(data.topRated);
  renderCancellations(data.cancellations);
}

async function load() {
  setBusy(refreshButton, true, "جارٍ التحديث…");

  try {
    const data = await api.get(`/api/reports?${buildQuery().toString()}`);
    render(data);
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل التقارير", "error");
  } finally {
    setBusy(refreshButton, false);
  }
}

/* ── الأحداث ──────────────────────────────────────────────── */
periodSelect?.addEventListener("change", () => {
  syncCustomFields();
  if (periodSelect.value !== "custom") load();
});

applyButton?.addEventListener("click", load);
refreshButton?.addEventListener("click", load);
printButton?.addEventListener("click", () => window.print());

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-export]");
  if (button) exportCsv(button.dataset.export);
});

syncCustomFields();
load();
