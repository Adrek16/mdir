import { api, dom, fmt, ui, table } from "../shared.js";

/**
 * صفحة العملاء: قائمة مجمّعة من `profiles` + `orders`، مع فلاتر
 * وبحث وترقيم صفحات. النقر على الصف يفتح ملف العميل.
 */

const { $, escapeHtml, setBusy, debounce } = dom;

const PER_PAGE = 25;

const searchInput = $("#cust-search");
const ordersFilter = $("#cust-filter-orders");
const repeatFilter = $("#cust-filter-repeat");
const fromFilter = $("#cust-filter-from");
const toFilter = $("#cust-filter-to");
const refreshButton = $("#cust-refresh");
const tbody = $("#customers-body");
const countLabel = $("#cust-count");
const pagination = $("#customers-pagination");

const state = {
  customers: [],
  page: 1,
  firstLoad: true,
};

function setStat(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setStats(stats) {
  setStat("#cust-stat-total", fmt.num(stats.total));
  setStat("#cust-stat-month", fmt.num(stats.thisMonth));
  setStat("#cust-stat-buyers", fmt.num(stats.buyers));
  setStat("#cust-stat-repeat", `${fmt.num(stats.repeatRate)}٪`);
}

function rowTemplate(customer) {
  const id = escapeHtml(customer.id);
  const href = `/customers/${encodeURIComponent(customer.id)}`;
  const name = customer.name || "بدون اسم";
  const whatsapp = customer.phone
    ? fmt.whatsappHref(
        customer.phone,
        `مرحباً ${name}، نتواصل معك من متجر ستور بخصوص طلبك.`
      )
    : "";

  return `
    <tr data-customer="${id}" data-href="${escapeHtml(href)}" tabindex="0">
      <td>
        <span class="m-cell-strong">${escapeHtml(name)}</span>
        <span class="m-cell-sub">${escapeHtml(customer.email || "—")}</span>
      </td>
      <td dir="ltr" class="m-cell-muted">${escapeHtml(customer.phone || "—")}</td>
      <td>
        <span class="m-cell-strong">${escapeHtml(fmt.num(customer.ordersCount))}</span>
        ${customer.ordersCount >= 2 ? '<span class="m-badge m-badge--info">متكرر</span>' : ""}
      </td>
      <td class="m-cell-money">${escapeHtml(fmt.money(customer.spend))}</td>
      <td class="m-cell-muted">${escapeHtml(
        customer.lastOrderAt ? fmt.timeAgo(customer.lastOrderAt) : "—"
      )}</td>
      <td class="m-cell-muted">${escapeHtml(fmt.date(customer.joinedAt))}</td>
      <td>
        <div class="m-table__actions">
          <a class="m-btn m-btn--ghost m-btn--xs" href="${escapeHtml(href)}">عرض الملف</a>
          ${
            whatsapp
              ? `<a class="m-btn m-btn--ghost m-btn--xs" href="${escapeHtml(whatsapp)}"
                    target="_blank" rel="noreferrer noopener">واتساب</a>`
              : ""
          }
        </div>
      </td>
    </tr>
  `;
}

function render() {
  if (!tbody) return;

  if (!state.customers.length) {
    ui.emptyRow(tbody, 7, "لا يوجد عملاء مطابقون لهذه الفلاتر");
    if (countLabel) countLabel.textContent = "لا نتائج";
    table.renderPagination(pagination, { page: 1, pages: 1, onChange: () => {} });
    return;
  }

  const slice = table.paginate(state.customers, state.page, PER_PAGE);
  state.page = slice.page;

  tbody.innerHTML = slice.items.map(rowTemplate).join("");

  if (countLabel) {
    countLabel.textContent = `${fmt.num(state.customers.length)} عميل — صفحة ${fmt.num(
      slice.page
    )} من ${fmt.num(slice.pages)}`;
  }

  table.renderPagination(pagination, {
    page: slice.page,
    pages: slice.pages,
    onChange: (page) => {
      state.page = page;
      render();
    },
  });
}

function buildParams() {
  const params = new URLSearchParams();
  if (searchInput?.value.trim()) params.set("query", searchInput.value.trim());
  if (ordersFilter?.value) params.set("hasOrders", ordersFilter.value);
  if (repeatFilter?.value) params.set("repeat", repeatFilter.value);
  if (fromFilter?.value) params.set("from", fromFilter.value);
  if (toFilter?.value) params.set("to", toFilter.value);
  return params;
}

async function load({ keepPage = false } = {}) {
  if (!keepPage) state.page = 1;
  if (state.firstLoad) ui.skeletonRows(tbody, 7);
  setBusy(refreshButton, true, "جارٍ التحديث…");

  try {
    const params = buildParams();
    const data = await api.get(`/api/customers?${params.toString()}`);
    state.customers = Array.isArray(data.customers) ? data.customers : [];
    setStats(data.stats || { total: 0, thisMonth: 0, buyers: 0, repeatRate: 0 });
    render();
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل العملاء", "error");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="m-table__empty">تعذّر تحميل العملاء</td></tr>`;
    }
  } finally {
    state.firstLoad = false;
    setBusy(refreshButton, false);
  }
}

function openRow(row) {
  if (!row) return;
  const href = row.dataset.href;
  if (href) location.href = href;
}

/* ── الأحداث ────────────────────────────────────────────── */
const debouncedLoad = debounce(() => load(), 280);
searchInput?.addEventListener("input", debouncedLoad);

[ordersFilter, repeatFilter, fromFilter, toFilter].forEach((control) => {
  control?.addEventListener("change", () => load());
});

refreshButton?.addEventListener("click", () => load({ keepPage: true }));

tbody?.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  openRow(event.target.closest("tr[data-customer]"));
});

tbody?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("a, button")) return;
  event.preventDefault();
  openRow(event.target.closest("tr[data-customer]"));
});

load();
