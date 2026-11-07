import {
  api,
  dom,
  fmt,
  ui,
  table,
  genderLabel,
  badgeLabel,
  artworkLabel,
} from "../shared.js";

/**
 * صفحة المنتجات: قائمة قابلة للفلترة، إضافة وتعديل في نافذة واحدة،
 * وتبديل سريع للظهور. كل التحقق النهائي على الخادم.
 */

const { $, escapeHtml, setBusy, debounce } = dom;

const PER_PAGE = 10;

const MAX_COLORS = 20;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const COLOR_PALETTE = [
  "#c87f62",
  "#d4a857",
  "#c3c6c9",
  "#e0a996",
  "#6b4a33",
  "#2b2b2b",
  "#9a5b45",
  "#7d8a6a",
];

const searchInput = $("#prod-search");
const categoryFilter = $("#prod-filter-category");
const visibilityFilter = $("#prod-filter-visibility");
const stockFilter = $("#prod-filter-stock");
const refreshButton = $("#prod-refresh");
const tbody = $("#products-body");
const countLabel = $("#prod-count");
const pagination = $("#products-pagination");

const dialog = $("#product-dialog");
const form = $("#product-form");
const errorBox = $("#product-error");
const saveButton = $("#product-save");
const deleteButton = $("#product-delete");

const colorsList = $("#product-colors");
const colorsEmpty = $("#product-colors-empty");
const addColorButton = $("#product-color-add");
const stockHint = $("#product-stock-hint");

const imagePreview = $("#product-image-preview");
const imageThumb = $("#product-image-thumb");
const imageInput = $("#product-image-input");
const imageClear = $("#product-image-clear");
const imageState = $("#product-image-state");

const fields = {
  id: $("#product-id"),
  name: $("#product-name"),
  subtitle: $("#product-subtitle"),
  category: $("#product-category"),
  gender: $("#product-gender"),
  badge: $("#product-badge"),
  artwork: $("#product-artwork"),
  price: $("#product-price"),
  compareAt: $("#product-compare"),
  stock: $("#product-stock"),
  tone: $("#product-tone"),
  toneText: $("#product-tone-text"),
  features: $("#product-features"),
  description: $("#product-description"),
  active: $("#product-active"),
};

const state = {
  products: [],
  categories: [],
  page: 1,
  editingId: null,
  firstLoad: true,
  // مسار الصورة الرئيسية المحفوظ في القاعدة (أو المرفوع للتوّ).
  imagePath: "",
  // أساس روابط bucket product-images — يأتي من /api/products.
  storageBase: "",
};

const MAX_IMAGES_PER_COLOR = 5;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const publicUrl = (path) => {
  const clean = String(path || "").trim().replace(/^\/+/, "");
  if (!clean || !state.storageBase) return "";
  const encoded = clean
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${state.storageBase}/${encoded}`;
};

const imageError = (file) => {
  if (!file) return "لم يُختر ملف";
  if (!IMAGE_TYPES.includes(file.type)) return "نوع الصورة غير مدعوم (PNG أو JPEG أو WebP أو AVIF فقط)";
  if (file.size > IMAGE_MAX_BYTES) return "حجم الصورة يتجاوز 5 ميغابايت";
  return "";
};

/**
 * api.post يمرّر الجسم كـ JSON، لذا نرفع الملف عبر fetch مباشرة
 * ونعيد { path, url } من الخادم. المسار يُولَّد على الخادم دائماً.
 */
async function uploadImageFile(file, scope = "main") {
  const typeError = imageError(file);
  if (typeError) throw new Error(typeError);

  const response = await fetch(`/api/products/upload?scope=${encodeURIComponent(scope)}`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
    credentials: "same-origin",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "تعذّر رفع الصورة");
  }

  return payload.data;
}

const categoryName = (slug) =>
  state.categories.find((item) => item.slug === slug)?.name || slug || "—";

/* ── عرض ───────────────────────────────────────────────── */

function stockCell(product) {
  const value = Number(product.stock) || 0;
  const tone = value === 0 ? "is-out" : value <= 5 ? "is-low" : "";
  const suffix = value === 0 ? " · نفد" : value <= 5 ? " · منخفض" : "";
  const stock = `<span class="m-stock ${tone}">${escapeHtml(fmt.num(value))}${suffix}</span>`;

  const colors = Array.isArray(product.colors) ? product.colors : [];
  if (!colors.length) return stock;

  const swatches = colors
    .slice(0, 6)
    .map(
      (color) =>
        `<span class="m-swatch" data-hex="${escapeHtml(color.hex)}" title="${escapeHtml(color.name)}"></span>`
    )
    .join("");

  return `
    <div class="m-stock-cell">
      ${stock}
      <span class="m-swatches">${swatches}<span class="m-swatches__count">${escapeHtml(fmt.num(colors.length))} ألوان</span></span>
    </div>
  `;
}

function renderTable() {
  if (!tbody) return;

  if (!state.products.length) {
    ui.emptyRow(tbody, 6, "لا توجد منتجات مطابقة لهذه الفلاتر");
    if (pagination) pagination.innerHTML = "";
  } else {
    const slice = table.paginate(state.products, state.page, PER_PAGE);
    state.page = slice.page;

    tbody.innerHTML = slice.items
      .map((product) => {
        const id = escapeHtml(product.id);
        const compare =
          product.compareAt && product.compareAt > product.price
            ? `<span class="m-cell-sub">بدل ${escapeHtml(fmt.money(product.compareAt))}</span>`
            : "";

        return `
          <tr data-product="${id}">
            <td>
              <span class="m-cell-id">${escapeHtml(product.name)}</span>
              ${
                product.subtitle
                  ? `<span class="m-cell-sub">${escapeHtml(product.subtitle)}</span>`
                  : ""
              }
            </td>
            <td>${escapeHtml(categoryName(product.category))}</td>
            <td>
              ${escapeHtml(fmt.money(product.price))}
              ${compare}
            </td>
            <td>${stockCell(product)}</td>
            <td>
              <button type="button" class="m-visibility ${product.active ? "is-on" : "is-off"}"
                      data-toggle="${id}" aria-pressed="${product.active ? "true" : "false"}">
                ${product.active ? "ظاهر" : "مخفي"}
              </button>
            </td>
            <td>
              <span class="m-row-actions">
                <button type="button" class="m-btn m-btn--ghost m-btn--xs" data-edit="${id}">تعديل</button>
                <button type="button" class="m-icon-btn m-icon-btn--danger" data-delete="${id}"
                        aria-label="حذف ${escapeHtml(product.name)}">✕</button>
              </span>
            </td>
          </tr>
        `;
      })
      .join("");

    // CSP يمنع style المضمّن في HTML؛ نلوّن العيّنات عبر CSSOM بعد الرسم.
    tbody.querySelectorAll(".m-swatch[data-hex]").forEach((swatch) => {
      swatch.style.background = swatch.dataset.hex;
    });

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
    countLabel.textContent = state.products.length
      ? `${fmt.num(state.products.length)} منتج — صفحة ${fmt.num(state.page)}`
      : "لا توجد منتجات";
  }
}

function renderStats(stats) {
  const set = (id, value) => {
    const element = $(id);
    if (element) element.textContent = fmt.num(value);
  };

  set("#prod-stat-total", stats?.total ?? 0);
  set("#prod-stat-active", stats?.active ?? 0);
  set("#prod-stat-hidden", stats?.hidden ?? 0);
  set("#prod-stat-out", stats?.outOfStock ?? 0);
}

/* ── التحميل ───────────────────────────────────────────── */

function currentQuery() {
  const params = new URLSearchParams();
  const query = searchInput?.value.trim();
  if (query) params.set("query", query);
  if (categoryFilter?.value) params.set("category", categoryFilter.value);
  if (visibilityFilter?.value) params.set("visibility", visibilityFilter.value);
  if (stockFilter?.value) params.set("stock", stockFilter.value);
  return params;
}

async function load({ keepPage = false } = {}) {
  setBusy(refreshButton, true, "جارٍ التحديث…");

  if (state.firstLoad) {
    ui.skeletonRows(tbody, 6);
    state.firstLoad = false;
  }

  try {
    const data = await api.get(`/api/products?${currentQuery().toString()}`);
    state.products = data.products;
    state.categories = data.categories ?? state.categories;
    state.storageBase = data.storagePublicBase ?? state.storageBase;
    if (!keepPage) state.page = 1;

    renderStats(data.stats);
    renderTable();
  } catch (error) {
    ui.toast(error.message || "تعذّر تحميل المنتجات", "error");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="m-table__empty">تعذّر تحميل المنتجات</td></tr>`;
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

function resetForm() {
  hideError();
  fields.id.value = "";
  fields.name.value = "";
  fields.subtitle.value = "";
  fields.price.value = "";
  fields.compareAt.value = "";
  fields.stock.value = "";
  fields.features.value = "";
  fields.description.value = "";
  fields.gender.value = "unisex";
  fields.badge.value = "";
  fields.artwork.value = "perfume";
  fields.active.checked = true;
  setTone("#6d4a33");
  renderMainImage("", "");
  renderColors([]);

  if (fields.category?.options.length) {
    fields.category.selectedIndex = 0;
  }
}

function setTone(value) {
  const tone = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(tone)) {
    fields.tone.value = tone.toLowerCase();
    fields.toneText.value = tone.toLowerCase();
  } else {
    fields.toneText.value = tone;
  }
}

/* ── صورة المنتج الرئيسية ─────────────────────────────── */

function renderMainImage(path, label = "") {
  state.imagePath = String(path || "");
  const url = publicUrl(state.imagePath);

  if (imagePreview) imagePreview.hidden = !url;
  if (imageClear) imageClear.hidden = !url;
  if (imageThumb) {
    if (url) imageThumb.src = url;
    else imageThumb.removeAttribute("src");
  }
  if (imageState) {
    imageState.textContent = label;
    imageState.hidden = !label;
  }
}

async function pickMainImage(event) {
  const file = event.target.files?.[0];
  if (imageInput) imageInput.value = "";
  if (!file) return;

  const typeError = imageError(file);
  if (typeError) return showError(typeError);

  renderMainImage(state.imagePath, "جارٍ رفع الصورة…");

  try {
    const uploaded = await uploadImageFile(file, "main");
    renderMainImage(uploaded.path, "تم رفع الصورة — تُحفظ مع المنتج.");
    hideError();
  } catch (error) {
    renderMainImage(state.imagePath, "");
    showError(error.message || "تعذّر رفع الصورة");
  }
}

function clearMainImage() {
  renderMainImage("", "");
}

/* ── الألوان ومخزون كل لون ─────────────────────────────── */

function createColorRow(color, index) {
  const name = String(color?.name ?? "");
  const hex = HEX_RE.test(String(color?.hex ?? ""))
    ? String(color.hex).toLowerCase()
    : COLOR_PALETTE[index % COLOR_PALETTE.length];

  const stock =
    color?.stock === 0 ? "0" : Number.isFinite(Number(color?.stock)) ? String(color.stock) : "";

  const images = Array.isArray(color?.images) ? color.images.filter(Boolean) : [];

  const row = document.createElement("div");
  row.className = "m-color-row";
  row.dataset.colorRow = "";
  row.innerHTML = `
    <div class="m-color-row__main">
      <label class="m-field m-color-row__name">
        <span>اللون</span>
        <input type="text" data-color-name maxlength="40" placeholder="ذهبي"
               value="${escapeHtml(name)}">
      </label>

      <div class="m-field m-color-row__hex">
        <span>الرمز</span>
        <span class="m-color-field">
          <input type="color" data-color-picker value="${hex}" aria-label="اختيار اللون">
          <input type="text" data-color-hex maxlength="7" dir="ltr" class="m-input--latin"
                 value="${hex}" aria-label="رمز اللون">
        </span>
      </div>

      <label class="m-field m-color-row__stock">
        <span>العدد بالمخزن</span>
        <input type="number" data-color-stock min="0" step="1" inputmode="numeric"
               placeholder="0" value="${escapeHtml(stock)}">
      </label>

      <button type="button" class="m-icon-btn m-icon-btn--danger m-color-row__remove"
              data-color-remove aria-label="حذف اللون">✕</button>
    </div>

    <div class="m-color-row__media">
      <div class="m-media__head m-media__head--inline">
        <span class="m-media__label">صور هذا اللون</span>
        <span class="m-media__count" data-color-count>0/${MAX_IMAGES_PER_COLOR}</span>
      </div>
      <div class="m-thumbs" data-color-thumbs></div>
      <label class="m-btn m-btn--ghost m-btn--xs m-media__pick">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple hidden
               data-color-file>
        <span>إضافة صور</span>
      </label>
    </div>
  `;

  const picker = row.querySelector("[data-color-picker]");
  const hexInput = row.querySelector("[data-color-hex]");
  const stockInput = row.querySelector("[data-color-stock]");
  const nameInput = row.querySelector("[data-color-name]");

  picker.addEventListener("input", () => {
    hexInput.value = picker.value;
  });

  hexInput.addEventListener("input", () => {
    const value = hexInput.value.trim();
    if (HEX_RE.test(value)) picker.value = value.toLowerCase();
  });

  stockInput.addEventListener("input", syncTotal);
  nameInput.addEventListener("input", hideError);

  row._images = images;
  renderColorThumbs(row);
  wireColorImages(row);

  return row;
}

/* ── صور كل لون ─────────────────────────────────────────── */

function renderColorThumbs(row) {
  const box = row.querySelector("[data-color-thumbs]");
  const counter = row.querySelector("[data-color-count]");
  const fileLabel = row.querySelector(".m-media__pick");
  const images = row._images || [];

  if (box) {
    box.innerHTML = images
      .map(
        (path, index) => `
          <span class="m-thumb" data-thumb="${index}">
            <img src="${escapeHtml(publicUrl(path))}" alt="صورة اللون ${index + 1}" loading="lazy">
            <button type="button" class="m-thumb__remove" data-thumb-remove="${index}"
                    aria-label="إزالة الصورة">✕</button>
          </span>
        `
      )
      .join("");
  }

  if (counter) {
    counter.textContent = `${images.length}/${MAX_IMAGES_PER_COLOR}`;
    counter.classList.toggle("is-full", images.length >= MAX_IMAGES_PER_COLOR);
  }

  if (fileLabel) fileLabel.classList.toggle("is-disabled", images.length >= MAX_IMAGES_PER_COLOR);

  box?.querySelectorAll("[data-thumb-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const position = Number(button.dataset.thumbRemove);
      row._images.splice(position, 1);
      renderColorThumbs(row);
    });
  });
}

function wireColorImages(row) {
  const input = row.querySelector("[data-color-file]");

  input?.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;

    const room = MAX_IMAGES_PER_COLOR - (row._images || []).length;
    if (room <= 0) {
      return showError(`الحد الأقصى ${MAX_IMAGES_PER_COLOR} صور لكل لون`);
    }
    if (files.length > room) {
      return showError(
        `الحد الأقصى ${MAX_IMAGES_PER_COLOR} صور لكل لون — يمكنك إضافة ${room} صورة إضافية فقط`
      );
    }

    for (const file of files) {
      const typeError = imageError(file);
      if (typeError) return showError(typeError);
    }

    const label = row.querySelector("[data-color-count]");
    if (label) label.textContent = "جارٍ الرفع…";

    try {
      for (const file of files) {
        const uploaded = await uploadImageFile(file, "color");
        row._images.push(uploaded.path);
      }
      hideError();
    } catch (error) {
      showError(error.message || "تعذّر رفع الصور");
    } finally {
      renderColorThumbs(row);
    }
  });
}

function addColorRow(color = {}) {
  if (!colorsList) return;

  if (colorsList.children.length >= MAX_COLORS) {
    ui.toast(`الحد الأقصى ${MAX_COLORS} لوناً للمنتج`, "error");
    return;
  }

  colorsList.appendChild(createColorRow(color, colorsList.children.length));
  syncTotal();
}

function renderColors(colors = []) {
  if (!colorsList) return;

  colorsList.innerHTML = "";
  (Array.isArray(colors) ? colors : [])
    .slice(0, MAX_COLORS)
    .forEach((color) => addColorRow(color));

  syncTotal();
}

function collectColors() {
  if (!colorsList) return [];

  return Array.from(colorsList.querySelectorAll("[data-color-row]")).map((row) => ({
    name: row.querySelector("[data-color-name]").value.trim(),
    hex: row.querySelector("[data-color-hex]").value.trim().toLowerCase(),
    stock: Number(row.querySelector("[data-color-stock]").value),
    images: (row._images || []).slice(0, MAX_IMAGES_PER_COLOR),
  }));
}

/** يعيد توزيع مخزون المنتج على ألوان قديمة بلا مخزون (توافق خلفي). */
function normalizeColors(colors, totalStock) {
  const list = (Array.isArray(colors) ? colors : []).map((color) => ({ ...color }));
  const missing = list.filter((color) => !Number.isFinite(Number(color.stock)));

  if (missing.length) {
    const used = list.reduce(
      (sum, color) => sum + (Number.isFinite(Number(color.stock)) ? Number(color.stock) : 0),
      0
    );
    const remaining = Math.max(0, Number(totalStock || 0) - used);
    const base = Math.floor(remaining / missing.length);
    const extra = remaining % missing.length;

    missing.forEach((color, index) => {
      color.stock = base + (index < extra ? 1 : 0);
    });
  }

  return list;
}

/** المخزون الكلي = مجموع مخزون الألوان، ويصبح الحقل للقراءة فقط عند وجود ألوان. */
function syncTotal() {
  if (!fields.stock) return;

  const rows = colorsList
    ? Array.from(colorsList.querySelectorAll("[data-color-row]"))
    : [];
  const hasColors = rows.length > 0;

  fields.stock.readOnly = hasColors;
  fields.stock.classList.toggle("is-readonly", hasColors);

  if (hasColors) {
    const total = rows.reduce((sum, row) => {
      const value = Number(row.querySelector("[data-color-stock]").value);
      return sum + (Number.isInteger(value) && value > 0 ? value : 0);
    }, 0);

    fields.stock.value = String(total);
  }

  if (stockHint) {
    stockHint.textContent = hasColors
      ? "محسوب تلقائياً من مجموع مخزون الألوان."
      : "أدخل المخزون يدوياً، أو أضف ألواناً ليُحسب تلقائياً.";
  }

  if (colorsEmpty) colorsEmpty.hidden = hasColors;
}

function openCreate() {
  state.editingId = null;
  resetForm();
  $("#product-dialog-mode").textContent = "منتج جديد";
  $("#product-dialog-title").textContent = "إضافة منتج";
  deleteButton.hidden = true;
  saveButton.textContent = "حفظ المنتج";
  ui.openDialog(dialog);
  fields.name.focus();
}

function openEdit(product) {
  state.editingId = product.id;
  hideError();

  fields.id.value = product.id;
  fields.name.value = product.name || "";
  fields.subtitle.value = product.subtitle || "";
  fields.category.value = product.category || "";
  fields.gender.value = product.gender || "unisex";
  fields.badge.value = product.badge || "";
  fields.artwork.value = product.artwork || "perfume";
  fields.price.value = product.price ?? "";
  fields.compareAt.value = product.compareAt ?? "";
  fields.stock.value = product.stock ?? "";
  fields.features.value = (product.features || []).join("\n");
  fields.description.value = product.description || "";
  fields.active.checked = product.active !== false;
  setTone(product.tone || "#6d4a33");
  renderMainImage(product.imagePath || "", "");
  renderColors(normalizeColors(product.colors, product.stock));

  $("#product-dialog-mode").textContent =
    `${badgeLabel(product.badge)} · ${genderLabel(product.gender)} · ${artworkLabel(product.artwork)}`;
  $("#product-dialog-title").textContent = product.name;
  deleteButton.hidden = false;
  saveButton.textContent = "حفظ التغييرات";
  ui.openDialog(dialog);
  fields.name.focus();
  fields.name.select();
}

function formPayload() {
  const features = fields.features.value
    .split(/[,،\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const colors = collectColors();

  const totalStock = colors.length
    ? colors.reduce(
        (sum, color) =>
          sum + (Number.isInteger(color.stock) && color.stock > 0 ? color.stock : 0),
        0
      )
    : Number(fields.stock.value);

  // خريطة { اسم اللون: [مسارات الصور] } — تُبنى من صفوف الألوان نفسها
  // حتى تتطابق المفاتيح مع أسماء الألوان المحفوظة تماماً.
  const colorImages = {};
  colors.forEach((color) => {
    if (color.name && color.images.length) {
      colorImages[color.name] = color.images.slice(0, MAX_IMAGES_PER_COLOR);
    }
  });

  return {
    name: fields.name.value.trim(),
    subtitle: fields.subtitle.value.trim(),
    category: fields.category.value,
    gender: fields.gender.value,
    badge: fields.badge.value || "",
    artwork: fields.artwork.value,
    price: Number(fields.price.value),
    compareAt: fields.compareAt.value === "" ? null : Number(fields.compareAt.value),
    stock: totalStock,
    colors: colors.map(({ name, hex, stock }) => ({ name, hex, stock })),
    imagePath: state.imagePath || "",
    colorImages,
    tone: fields.toneText.value.trim(),
    features,
    description: fields.description.value.trim(),
    active: fields.active.checked,
  };
}

/* ── التعديلات ─────────────────────────────────────────── */

async function saveProduct(event) {
  event.preventDefault();
  hideError();

  const payload = formPayload();

  if (!payload.name || payload.name.length < 2) return showError("اسم المنتج مطلوب");
  if (!Number.isFinite(payload.price) || payload.price < 0) {
    return showError("السعر غير صحيح");
  }

  const seenColors = new Set();
  for (const color of payload.colors) {
    if (!color.name) return showError("اسم كل لون مطلوب");
    if (color.name.length > 40) return showError(`اسم اللون «${color.name}» طويل جداً`);

    const key = color.name.toLowerCase();
    if (seenColors.has(key)) return showError(`اللون «${color.name}» مكرر — استخدم اسماً مختلفاً`);
    seenColors.add(key);

    if (!HEX_RE.test(color.hex)) {
      return showError(`لون «${color.name}» يجب أن يكون بصيغة #RRGGBB`);
    }
    if (!Number.isInteger(color.stock) || color.stock < 0) {
      return showError(`عدد «${color.name}» يجب أن يكون رقماً صحيحاً غير سالب`);
    }
    if (color.images.length > MAX_IMAGES_PER_COLOR) {
      return showError(`الحد الأقصى ${MAX_IMAGES_PER_COLOR} صور لكل لون — راجع «${color.name}»`);
    }
  }

  if (!Number.isInteger(payload.stock) || payload.stock < 0) {
    return showError("المخزون يجب أن يكون رقماً صحيحاً غير سالب");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(payload.tone)) {
    return showError("اللون يجب أن يكون بصيغة #RRGGBB");
  }

  setBusy(saveButton, true, "جارٍ الحفظ…");

  try {
    if (state.editingId) {
      await api.patch(`/api/products/${encodeURIComponent(state.editingId)}`, payload);
      ui.toast("تم تحديث المنتج وتحديث المتجر");
    } else {
      await api.post("/api/products", payload);
      ui.toast("تمت إضافة المنتج وتحديث المتجر");
    }

    ui.closeDialog(dialog);
    await load({ keepPage: true });
  } catch (error) {
    showError(error.message || "تعذّر حفظ المنتج");
  } finally {
    setBusy(saveButton, false);
  }
}

async function toggleActive(product) {
  try {
    await api.patch(`/api/products/${encodeURIComponent(product.id)}`, {
      active: !product.active,
    });
    product.active = !product.active;
    renderTable();
    ui.toast(product.active ? "المنتج ظاهر الآن" : "تم إخفاء المنتج");
    await load({ keepPage: true });
  } catch (error) {
    ui.toast(error.message || "تعذّر تبديل الظهور", "error");
  }
}

async function removeProduct(product) {
  const confirmed = await ui.confirmAction({
    title: "حذف المنتج",
    message: `سيُحذف «${product.name}» نهائياً من الكتالوج. لا يمكن التراجع.`,
    confirmText: "حذف نهائي",
    danger: true,
  });

  if (!confirmed) return;

  try {
    await api.delete(`/api/products/${encodeURIComponent(product.id)}`);
    ui.toast("تم حذف المنتج");
    ui.closeDialog(dialog);
    await load({ keepPage: true });
  } catch (error) {
    ui.toast(error.message || "تعذّر حذف المنتج", "error");
  }
}

/* ── الأحداث ───────────────────────────────────────────── */

tbody?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const product = state.products.find((item) => item.id === editButton.dataset.edit);
    if (product) openEdit(product);
    return;
  }

  const toggleButton = event.target.closest("[data-toggle]");
  if (toggleButton) {
    const product = state.products.find((item) => item.id === toggleButton.dataset.toggle);
    if (product) toggleActive(product);
    return;
  }

  const deleteTarget = event.target.closest("[data-delete]");
  if (deleteTarget) {
    const product = state.products.find((item) => item.id === deleteTarget.dataset.delete);
    if (product) removeProduct(product);
  }
});

$("#product-new")?.addEventListener("click", openCreate);
refreshButton?.addEventListener("click", () => load({ keepPage: true }));
form?.addEventListener("submit", saveProduct);

addColorButton?.addEventListener("click", () => addColorRow());

colorsList?.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-color-remove]");
  if (!remove) return;

  remove.closest("[data-color-row]")?.remove();
  syncTotal();
});

deleteButton?.addEventListener("click", () => {
  const product = state.products.find((item) => item.id === state.editingId);
  if (product) removeProduct(product);
});

searchInput?.addEventListener("input", debounce(() => load(), 320));

[categoryFilter, visibilityFilter, stockFilter].forEach((select) => {
  select?.addEventListener("change", () => load());
});

fields.tone?.addEventListener("input", () => {
  fields.toneText.value = fields.tone.value;
});

fields.toneText?.addEventListener("input", () => {
  const value = fields.toneText.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) fields.tone.value = value.toLowerCase();
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => ui.closeDialog(button.closest("dialog")));
});

dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) ui.closeDialog(dialog);
});

fields.name?.addEventListener("input", hideError);

imageInput?.addEventListener("change", pickMainImage);
imageClear?.addEventListener("click", clearMainImage);

/* ── الإقلاع ───────────────────────────────────────────── */

// يدعم /products?category=… قادماً من صفحة التصنيفات.
const initialCategory = new URLSearchParams(location.search).get("category");
if (initialCategory && categoryFilter) {
  const exists = Array.from(categoryFilter.options).some(
    (option) => option.value === initialCategory
  );
  if (exists) categoryFilter.value = initialCategory;
}

load();
