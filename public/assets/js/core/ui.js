import { escapeHtml } from "./dom.js";

/**
 * مكوّنات واجهة متكررة: تنبيهات، نوافذ، تأكيد، حالات فراغ/تحميل.
 * كلها مبنية على عناصر المتصفح الأصلية بلا مكتبات.
 */

let toastHost = null;

function ensureToastHost() {
  if (toastHost?.isConnected) return toastHost;
  toastHost = document.createElement("div");
  toastHost.className = "m-toasts";
  toastHost.setAttribute("role", "status");
  toastHost.setAttribute("aria-live", "polite");
  document.body.appendChild(toastHost);
  return toastHost;
}

/** تنبيه عائم قصير. type: success | error | info */
export function toast(message, type = "success") {
  const host = ensureToastHost();
  const item = document.createElement("div");
  item.className = `m-toast m-toast--${type}`;
  item.textContent = message;
  host.appendChild(item);

  setTimeout(() => {
    item.classList.add("is-leaving");
    setTimeout(() => item.remove(), 220);
  }, 3800);
}

export function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

/** نافذة تأكيد تعيد Promise<boolean>. */
export function confirmAction({
  title = "تأكيد العملية",
  message = "هل أنت متأكد؟",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "m-modal m-modal--sm";
    dialog.innerHTML = `
      <div class="m-modal__head">
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="m-modal__body">
        <p class="m-confirm__text">${escapeHtml(message)}</p>
      </div>
      <div class="m-modal__foot">
        <button type="button" class="m-btn m-btn--ghost" data-cancel>${escapeHtml(cancelText)}</button>
        <button type="button" class="m-btn ${danger ? "m-btn--danger" : "m-btn--copper"}" data-confirm>
          ${escapeHtml(confirmText)}
        </button>
      </div>
    `;
    document.body.appendChild(dialog);

    const finish = (result) => {
      closeDialog(dialog);
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector("[data-cancel]")?.addEventListener("click", () => finish(false));
    dialog.querySelector("[data-confirm]")?.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(false);
    });

    openDialog(dialog);
  });
}

export function skeletonRows(tbody, columns, rows = 5) {
  if (!tbody) return;
  tbody.innerHTML = Array.from({ length: rows })
    .map(
      () => `
        <tr class="is-skeleton">
          ${Array.from({ length: columns })
            .map(() => '<td><span class="m-skeleton"></span></td>')
            .join("")}
        </tr>
      `
    )
    .join("");
}

export function emptyRow(tbody, columns, message = "لا توجد بيانات") {
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="${columns}" class="m-table__empty">
        <span class="m-empty__icon" aria-hidden="true">◌</span>
        <span>${escapeHtml(message)}</span>
      </td>
    </tr>
  `;
}
