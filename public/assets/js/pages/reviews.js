import { api, dom, fmt, ui } from "../shared.js";

/**
 * مراجعة التقييمات: تبويبات بالحالة، بحث، اعتماد/رفض/رد/حذف.
 * كل تغيير يعيد حساب تقييم المنتج على الخادم ثم يُعاد تحميل القائمة.
 */

const { $, escapeHtml, setBusy, debounce } = dom;

const list = $("#reviews-list");
const searchInput = $("#reviews-search");
const refreshButton = $("#reviews-refresh");

const state = {
  status: "pending",
  query: "",
};

const STATUS_LABEL = {
  pending: "بانتظار المراجعة",
  approved: "معتمدة",
  rejected: "مرفوضة",
};

const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

function stars(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function setCount(id, value) {
  const element = $(id);
  if (element) element.textContent = fmt.num(value);
}

function renderCounts(counts) {
  setCount("#count-all", counts.all);
  setCount("#count-pending", counts.pending);
  setCount("#count-approved", counts.approved);
  setCount("#count-rejected", counts.rejected);
}

function card(review) {
  const id = escapeHtml(review.id);
  const tone = STATUS_TONE[review.status] || "muted";
  const statusLabel = STATUS_LABEL[review.status] || review.status;

  const approve =
    review.status !== "approved"
      ? `<button type="button" class="m-btn m-btn--success m-btn--xs" data-action="approve">اعتماد</button>`
      : "";
  const reject =
    review.status !== "rejected"
      ? `<button type="button" class="m-btn m-btn--danger m-btn--xs" data-action="reject">رفض</button>`
      : "";

  return `
    <article class="m-review-card" data-id="${id}">
      <header class="m-review-card__head">
        <div>
          <h3>${escapeHtml(review.productName)}</h3>
          <p>
            ${escapeHtml(review.customerName)}
            ${review.customerEmail ? `· <span dir="ltr">${escapeHtml(review.customerEmail)}</span>` : ""}
            · ${escapeHtml(fmt.date(review.createdAt))}
          </p>
        </div>
        <div class="m-review-card__meta">
          <span class="m-stars" aria-label="${escapeHtml(
            `${review.rating} من 5`
          )}">${escapeHtml(stars(review.rating))}</span>
          <span class="m-badge m-badge--${tone}">${escapeHtml(statusLabel)}</span>
        </div>
      </header>

      <p class="m-review-card__comment">
        ${review.comment ? escapeHtml(review.comment) : '<span class="m-cell-muted">بدون تعليق</span>'}
      </p>

      ${
        review.orderId
          ? `<p class="m-review-card__order">طلب مرتبط: <span dir="ltr">#${escapeHtml(
              fmt.shortId(review.orderId)
            )}</span></p>`
          : ""
      }

      <form class="m-review-reply" data-reply>
        <label class="m-field m-field--compact">
          <span>رد المدير (اختياري)</span>
          <input type="text" maxlength="600" data-reply-input
                 value="${escapeHtml(review.managerReply || "")}"
                 placeholder="يظهر تحت تعليق العميل في المتجر">
        </label>
        <button type="submit" class="m-btn m-btn--ghost m-btn--xs">حفظ الرد</button>
      </form>

      <div class="m-review-card__actions">
        ${approve}
        ${reject}
        <button type="button" class="m-btn m-btn--ghost m-btn--xs" data-action="delete">حذف نهائي</button>
      </div>
    </article>
  `;
}

function render(data) {
  renderCounts(data.counts || { all: 0, pending: 0, approved: 0, rejected: 0 });

  if (!data.reviews.length) {
    list.innerHTML = `
      <div class="m-reviews-empty">
        <p>لا توجد تقييمات مطابقة.</p>
        <p>عندما يكتب العملاء تقييماتهم ستظهر هنا بانتظار مراجعتك.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = data.reviews.map(card).join("");
}

function syncTabs() {
  document.querySelectorAll("[data-status]").forEach((tab) => {
    const active = tab.dataset.status === state.status;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

async function load() {
  setBusy(refreshButton, true, "جارٍ التحديث…");
  syncTabs();

  try {
    const params = new URLSearchParams();
    if (state.status) params.set("status", state.status);
    if (state.query) params.set("query", state.query);

    const data = await api.get(`/api/reviews?${params.toString()}`);
    render(data);
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل التقييمات", "error");
    list.innerHTML = `<div class="m-reviews-empty"><p>تعذّر تحميل التقييمات.</p></div>`;
  } finally {
    setBusy(refreshButton, false);
  }
}

/* ── إجراءات البطاقة ─────────────────────────────────────── */
list?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest("[data-id]");
  if (!card) return;

  const id = card.dataset.id;
  const action = button.dataset.action;

  if (action === "delete") {
    const confirmed = await ui.confirmAction({
      title: "حذف التقييم",
      message: "سيُحذف التقييم نهائياً ويُعاد حساب متوسط المنتج. لا يمكن التراجع.",
      confirmText: "حذف",
      danger: true,
    });
    if (!confirmed) return;

    setBusy(button, true, "جارٍ الحذف…");
    try {
      await api.delete(`/api/reviews/${encodeURIComponent(id)}`);
      ui.toast("تم حذف التقييم");
      await load();
    } catch (error) {
      ui.toast(error.message || "تعذّر حذف التقييم", "error");
      setBusy(button, false);
    }
    return;
  }

  const status = action === "approve" ? "approved" : "rejected";
  setBusy(button, true, "جارٍ الحفظ…");

  try {
    await api.patch(`/api/reviews/${encodeURIComponent(id)}`, { status });
    ui.toast(status === "approved" ? "تم اعتماد التقييم" : "تم رفض التقييم");
    await load();
  } catch (error) {
    ui.toast(error.message || "تعذّر تحديث التقييم", "error");
    setBusy(button, false);
  }
});

list?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-reply]");
  if (!form) return;
  event.preventDefault();

  const card = form.closest("[data-id]");
  const id = card?.dataset.id;
  if (!id) return;

  const input = form.querySelector("[data-reply-input]");
  const submit = form.querySelector("button");
  setBusy(submit, true, "جارٍ الحفظ…");

  try {
    await api.patch(`/api/reviews/${encodeURIComponent(id)}`, {
      managerReply: input?.value || "",
    });
    ui.toast("تم حفظ الرد");
  } catch (error) {
    ui.toast(error.message || "تعذّر حفظ الرد", "error");
  } finally {
    setBusy(submit, false);
  }
});

/* ── التبويبات والبحث ────────────────────────────────────── */
document.addEventListener("click", (event) => {
  const tab = event.target.closest(".m-reviews-tab[data-status]");
  if (!tab) return;
  state.status = tab.dataset.status;
  load();
});

searchInput?.addEventListener(
  "input",
  debounce(() => {
    state.query = searchInput.value.trim();
    load();
  }, 280)
);

refreshButton?.addEventListener("click", load);

load();
