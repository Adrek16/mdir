import {
  api,
  dom,
  fmt,
  ui,
  table,
  categoryParentLabel,
  genderLabel,
} from "../shared.js";

/**
 * صفحة التصنيفات: قائمة قابلة للفلترة (بحث وقسم وحالة المنتجات)،
 * إضافة وتعديل في نافذة واحدة، وحذف محمي على الخادم.
 *
 * الرابط (slug) يُولَّد تلقائياً على الخادم ولا يظهر هنا.
 */

const { $, escapeHtml, setBusy, debounce } = dom;

const PER_PAGE = 10;

const searchInput = $("#cat-search");
const parentFilter = $("#cat-filter-parent");
const productsFilter = $("#cat-filter-products");
const refreshButton = $("#cat-refresh");
const tbody = $("#categories-body");
const countLabel = $("#cat-count");
const pagination = $("#categories-pagination");

const dialog = $("#category-dialog");
const form = $("#category-form");
const errorBox = $("#category-error");
const saveButton = $("#category-save");
const deleteButton = $("#category-delete");

const fields = {
  name: $("#category-name"),
  nameEn: $("#category-name-en"),
  parent: $("#category-parent"),
  gender: $("#category-gender"),
  sortOrder: $("#category-sort"),
  blurb: $("#category-blurb"),
};

const state = {
  categories: [],
  all: [],
  page: 1,
  editingSlug: null,
  firstLoad: true,
};

/* ── عرض ───────────────────────────────────────────────── */

function filteredCategories() {
  const term = searchInput?.value.trim().toLowerCase() ?? "";
  const parent = parentFilter?.value ?? "";
  const products = productsFilter?.value ?? "";

  return state.all.filter((category) => {
    if (parent === "none" && category.parent) return false;
    if (parent && parent !== "none" && category.parent !== parent) return false;

    if (products === "filled" && category.productCount === 0) return false;
    if (products === "empty" && category.productCount > 0) return false;

    if (!term) return true;

    const haystack = [category.name, category.nameEn, category.blurb]
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });
}

function countCell(category) {
  const slug = encodeURIComponent(category.slug);
  const tone = category.productCount > 0 ? "is-filled" : "is-empty";

  if (category.productCount === 0) {
    return `<span class="m-cat-count ${tone}">لا منتجات</span>`;
  }

  return `<a class="m-cat-count ${tone}" href="/products?category=${slug}"
             title="عرض منتجات هذا التصنيف">${escapeHtml(fmt.num(category.productCount))} منتج</a>`;
}

function renderTable() {
  if (!tbody) return;

  state.categories = filteredCategories();

  if (!state.categories.length) {
    ui.emptyRow(tbody, 6, "لا توجد تصنيفات مطابقة لهذه الفلاتر");
    if (pagination) pagination.innerHTML = "";
  } else {
    const slice = table.paginate(state.categories, state.page, PER_PAGE);
    state.page = slice.page;

    tbody.innerHTML = slice.items
      .map((category) => {
        const slug = escapeHtml(category.slug);

        return `
          <tr data-category="${slug}">
            <td>
              <span class="m-cell-id">${escapeHtml(category.name)}</span>
            </td>
            <td><span class="m-cat-parent">${escapeHtml(categoryParentLabel(category.parent))}</span></td>
            <td>${category.gender ? escapeHtml(genderLabel(category.gender)) : "—"}</td>
            <td>${countCell(category)}</td>
            <td>${escapeHtml(fmt.num(category.sortOrder))}</td>
            <td>
              <span class="m-row-actions">
                <button type="button" class="m-btn m-btn--ghost m-btn--xs" data-edit="${slug}">تعديل</button>
                <button type="button" class="m-icon-btn m-icon-btn--danger" data-delete="${slug}"
                        aria-label="حذف ${escapeHtml(category.name)}">✕</button>
              </span>
            </td>
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
    countLabel.textContent = state.categories.length
      ? `${fmt.num(state.categories.length)} تصنيف — صفحة ${fmt.num(state.page)}`
      : "لا توجد تصنيفات";
  }
}

function renderStats(stats) {
  const set = (id, value) => {
    const element = $(id);
    if (element) element.textContent = fmt.num(value);
  };

  set("#cat-stat-total", stats?.total ?? 0);
  set("#cat-stat-filled", stats?.withProducts ?? 0);
  set("#cat-stat-empty", stats?.empty ?? 0);
  set("#cat-stat-noparent", stats?.withoutParent ?? 0);
}

/* ── التحميل ───────────────────────────────────────────── */

async function load() {
  setBusy(refreshButton, true, "جارٍ التحديث…");

  if (state.firstLoad) {
    ui.skeletonRows(tbody, 6);
    state.firstLoad = false;
  }

  try {
    const data = await api.get("/api/categories");
    state.all = data.categories ?? [];
    state.page = 1;
    renderStats(data.stats);
    renderTable();
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل التصنيفات", "error");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="m-table__empty">تعذّر تحميل التصنيفات</td></tr>`;
    }
  } finally {
    setBusy(refreshButton, false);
  }
}

/* ── النافذة ───────────────────────────────────────────── */

function showError(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  if (errorBox) errorBox.hidden = true;
}

function setParent(value) {
  const parent = String(value ?? "");
  const exists = Array.from(fields.parent?.options ?? []).some(
    (option) => option.value === parent
  );
  fields.parent.value = exists ? parent : "";
}

function resetForm() {
  hideError();
  fields.name.value = "";
  fields.nameEn.value = "";
  fields.gender.value = "";
  fields.blurb.value = "";
  fields.sortOrder.value = "";
  setParent("");
}

function openCreate() {
  state.editingSlug = null;
  resetForm();
  $("#category-dialog-mode").textContent = "تصنيف جديد";
  $("#category-dialog-title").textContent = "إضافة تصنيف";
  deleteButton.hidden = true;
  saveButton.textContent = "حفظ التصنيف";
  ui.openDialog(dialog);
  fields.name.focus();
}

function openEdit(category) {
  state.editingSlug = category.slug;
  hideError();

  fields.name.value = category.name || "";
  fields.nameEn.value = category.nameEn || "";
  fields.gender.value = category.gender || "";
  fields.blurb.value = category.blurb || "";
  fields.sortOrder.value = category.sortOrder ?? 0;
  setParent(category.parent);

  $("#category-dialog-mode").textContent =
    `${categoryParentLabel(category.parent)} · ${fmt.num(category.productCount)} منتج`;
  $("#category-dialog-title").textContent = category.name;
  deleteButton.hidden = false;
  saveButton.textContent = "حفظ التغييرات";
  ui.openDialog(dialog);
  fields.name.focus();
  fields.name.select();
}

function formPayload() {
  return {
    name: fields.name.value.trim(),
    nameEn: fields.nameEn.value.trim(),
    parent: fields.parent.value,
    gender: fields.gender.value,
    blurb: fields.blurb.value.trim(),
    sortOrder: fields.sortOrder.value === "" ? 0 : Number(fields.sortOrder.value),
  };
}

/* ── التعديلات ─────────────────────────────────────────── */

async function saveCategory(event) {
  event.preventDefault();
  hideError();

  const payload = formPayload();

  if (!payload.name || payload.name.length < 2) return showError("اسم التصنيف مطلوب");
  if (!Number.isInteger(payload.sortOrder) || payload.sortOrder < 0) {
    return showError("الترتيب يجب أن يكون رقماً صحيحاً غير سالب");
  }

  setBusy(saveButton, true, "جارٍ الحفظ…");

  try {
    if (state.editingSlug) {
      await api.patch(
        `/api/categories/${encodeURIComponent(state.editingSlug)}`,
        payload
      );
      ui.toast("تم تحديث التصنيف وتحديث المتجر");
    } else {
      await api.post("/api/categories", payload);
      ui.toast("تمت إضافة التصنيف وتحديث المتجر");
    }

    ui.closeDialog(dialog);
    await load();
  } catch (error) {
    showError(error.message || "تعذّر حفظ التصنيف");
  } finally {
    setBusy(saveButton, false);
  }
}

async function removeCategory(category) {
  const hasProducts = category.productCount > 0;

  const confirmed = await ui.confirmAction({
    title: "حذف التصنيف",
    message: hasProducts
      ? `«${category.name}» يحتوي ${fmt.num(category.productCount)} منتج — انقل منتجاته إلى تصنيف آخر قبل الحذف.`
      : `سيُحذف «${category.name}» نهائياً. لا يمكن التراجع.`,
    confirmText: "حذف نهائي",
    danger: true,
  });

  if (!confirmed) return;

  try {
    await api.delete(`/api/categories/${encodeURIComponent(category.slug)}`);
    ui.toast("تم حذف التصنيف");
    ui.closeDialog(dialog);
    await load();
  } catch (error) {
    ui.toast(error.message || "تعذّر حذف التصنيف", "error");
  }
}

/* ── الأحداث ───────────────────────────────────────────── */

tbody?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const category = state.categories.find((item) => item.slug === editButton.dataset.edit);
    if (category) openEdit(category);
    return;
  }

  const deleteTarget = event.target.closest("[data-delete]");
  if (deleteTarget) {
    const category = state.categories.find((item) => item.slug === deleteTarget.dataset.delete);
    if (category) removeCategory(category);
  }
});

$("#category-new")?.addEventListener("click", openCreate);
refreshButton?.addEventListener("click", load);
form?.addEventListener("submit", saveCategory);

deleteButton?.addEventListener("click", () => {
  const category = state.all.find((item) => item.slug === state.editingSlug);
  if (category) removeCategory(category);
});

searchInput?.addEventListener("input", debounce(() => {
  state.page = 1;
  renderTable();
}, 220));

[parentFilter, productsFilter].forEach((select) => {
  select?.addEventListener("change", () => {
    state.page = 1;
    renderTable();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => ui.closeDialog(button.closest("dialog")));
});

dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) ui.closeDialog(dialog);
});

fields.name?.addEventListener("input", hideError);
fields.nameEn?.addEventListener("input", hideError);

/* ── الإقلاع ───────────────────────────────────────────── */

load();
