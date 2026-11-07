import { api, dom } from "../shared.js";

/**
 * طرق الدفع: قائمة ديناميكية (بنوك + محافظ) تُحفظ كاملة على الخادم.
 *
 * الخادم يعيد التحقق دائماً — تحقق المتصفح هنا لتجربة أسرع فقط.
 */

const { $, escapeHtml, on, setBusy } = dom;

const listBox = $("#methods-list");
const saveButton = $("#methods-save");
const reloadButton = $("#methods-reload");
const errorBox = $("#methods-error");
const successBox = $("#methods-success");

const addForm = $("#method-add-form");
const addError = $("#add-error");
const addFields = {
  type: $("#add-type"),
  name: $("#add-name"),
  accountName: $("#add-account-name"),
  accountNumber: $("#add-account-number"),
  note: $("#add-note"),
};

const TYPE_LABEL = { bank: "بنك", wallet: "محفظة" };

let methods = [];

function showError(message) {
  if (successBox) successBox.hidden = true;
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function showSuccess(message) {
  if (errorBox) errorBox.hidden = true;
  if (!successBox) return;
  successBox.textContent = message;
  successBox.hidden = false;
}

function clearMessages() {
  if (errorBox) errorBox.hidden = true;
  if (successBox) successBox.hidden = true;
}

function newId() {
  return `pm_${Math.random().toString(36).slice(2, 10)}`;
}

function rowTemplate(method, index) {
  const active = method.active !== false;
  return `
    <article class="m-pay-item${active ? "" : " is-off"}" data-id="${escapeHtml(method.id)}">
      <div class="m-pay-item__head">
        <span class="m-badge ${method.type === "bank" ? "m-badge--indigo" : "m-badge--info"}">
          ${TYPE_LABEL[method.type] || "محفظة"}
        </span>
        <input class="m-pay-item__name" type="text" maxlength="80" data-field="name"
               value="${escapeHtml(method.name)}" aria-label="اسم طريقة الدفع">
        <label class="m-pay-toggle">
          <input type="checkbox" data-field="active" ${active ? "checked" : ""}>
          <span>مفعّلة</span>
        </label>
        <div class="m-pay-item__actions">
          <button type="button" class="m-btn m-btn--ghost m-btn--xs" data-action="up"
                  ${index === 0 ? "disabled" : ""} aria-label="أعلى">↑</button>
          <button type="button" class="m-btn m-btn--ghost m-btn--xs" data-action="down"
                  ${index === methods.length - 1 ? "disabled" : ""} aria-label="أسفل">↓</button>
          <button type="button" class="m-btn m-btn--danger m-btn--xs" data-action="delete">
            حذف
          </button>
        </div>
      </div>

      <div class="m-pay-item__grid">
        <label class="m-field m-field--compact">
          <span>اسم صاحب الحساب</span>
          <input type="text" maxlength="120" data-field="accountName"
                 value="${escapeHtml(method.accountName)}">
        </label>
        <label class="m-field m-field--compact">
          <span>رقم الحساب / المحفظة</span>
          <input type="text" maxlength="60" dir="ltr" class="m-input--latin"
                 data-field="accountNumber" value="${escapeHtml(method.accountNumber)}">
        </label>
      </div>

      <label class="m-field m-field--compact">
        <span>ملاحظة للعميل (اختياري)</span>
        <input type="text" maxlength="300" data-field="note"
               value="${escapeHtml(method.note)}">
      </label>
    </article>
  `;
}

function render() {
  if (!listBox) return;

  if (methods.length === 0) {
    listBox.innerHTML = `
      <div class="m-pay-empty">
        <p>لا توجد طرق دفع بعد.</p>
        <p>الدفع عند الاستلام متاح دائماً — أضف بنكاً أو محفظة من النموذج أدناه.</p>
      </div>
    `;
    return;
  }

  listBox.innerHTML = methods.map(rowTemplate).join("");
}

function findMethod(id) {
  return methods.find((method) => method.id === id);
}

function validate() {
  for (const method of methods) {
    if (!method.name) return "اسم كل طريقة دفع مطلوب";
    if (!method.accountNumber) return `رقم الحساب مطلوب لـ «${method.name}»`;
    if (method.type === "bank" && !method.accountName) {
      return `اسم صاحب الحساب مطلوب لـ «${method.name}»`;
    }
  }
  if (methods.length > 0 && !methods.some((method) => method.active !== false)) {
    return "أبقِ طريقة واحدة مفعّلة على الأقل";
  }
  return "";
}

async function load() {
  clearMessages();
  setBusy(reloadButton, true, "جارٍ التحميل…");

  try {
    const data = await api.get("/api/settings/payment-methods");
    methods = Array.isArray(data.methods) ? data.methods : [];
    render();
  } catch (error) {
    showError(error.message || "تعذّر تحميل طرق الدفع");
  } finally {
    setBusy(reloadButton, false);
  }
}

async function save() {
  clearMessages();
  const problem = validate();
  if (problem) return showError(problem);

  setBusy(saveButton, true, "جارٍ الحفظ…");

  try {
    const data = await api.put("/api/settings/payment-methods", { methods });
    methods = Array.isArray(data.methods) ? data.methods : methods;
    render();
    showSuccess("تم حفظ طرق الدفع وتحديث المتجر");
  } catch (error) {
    showError(error.message || "تعذّر حفظ طرق الدفع");
  } finally {
    setBusy(saveButton, false);
  }
}

/* ── تعديل الحقول داخل الصفوف ─────────────────────────── */
on(listBox, "input", "[data-field]", (event, field) => {
  const row = field.closest("[data-id]");
  const method = row ? findMethod(row.dataset.id) : null;
  if (!method) return;

  const key = field.dataset.field;
  if (key === "active") {
    method.active = field.checked;
    row.classList.toggle("is-off", !field.checked);
    return;
  }
  method[key] = field.value;
});

on(listBox, "click", "[data-action]", (event, button) => {
  event.preventDefault();
  const row = button.closest("[data-id]");
  if (!row) return;

  const index = methods.findIndex((method) => method.id === row.dataset.id);
  if (index === -1) return;

  const action = button.dataset.action;

  if (action === "delete") {
    methods.splice(index, 1);
  } else if (action === "up" && index > 0) {
    [methods[index - 1], methods[index]] = [methods[index], methods[index - 1]];
  } else if (action === "down" && index < methods.length - 1) {
    [methods[index + 1], methods[index]] = [methods[index], methods[index + 1]];
  }

  render();
});

/* ── إضافة طريقة جديدة ────────────────────────────────── */
addForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (addError) addError.hidden = true;

  const method = {
    id: newId(),
    type: addFields.type?.value === "bank" ? "bank" : "wallet",
    name: (addFields.name?.value || "").trim(),
    accountName: (addFields.accountName?.value || "").trim(),
    accountNumber: (addFields.accountNumber?.value || "").trim(),
    note: (addFields.note?.value || "").trim(),
    active: true,
    sort: methods.length + 1,
  };

  const problem =
    !method.name
      ? "اكتب اسم طريقة الدفع"
      : !method.accountNumber
        ? "اكتب رقم الحساب أو المحفظة"
        : method.type === "bank" && !method.accountName
          ? "اسم صاحب الحساب مطلوب للحساب البنكي"
          : "";

  if (problem) {
    if (addError) {
      addError.textContent = problem;
      addError.hidden = false;
    }
    return;
  }

  methods.push(method);
  render();
  addForm.reset();
  addFields.type?.focus();
});

saveButton?.addEventListener("click", save);
reloadButton?.addEventListener("click", load);

load();
