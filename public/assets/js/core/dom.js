/**
 * أدوات DOM صغيرة — بلا أي مكتبة خارجية.
 */

export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** يهرّب النصوص قبل وضعها داخل HTML. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

/** تأخير تنفيذ دالة — للبحث الحيّ. */
export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * مستمع أحداث بتفويض — يصلح للجداول التي تُعاد رسمها باستمرار.
 */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (!target || !root.contains(target)) return;
    handler(event, target);
  });
}

/** يعطّل الزر أثناء الطلب ويعيد نصه الأصلي بعده. */
export function setBusy(button, busy, busyText = "جارٍ التنفيذ…") {
  if (!button) return;
  if (busy) {
    button.dataset.idleText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    button.classList.add("is-busy");
  } else {
    button.textContent = button.dataset.idleText || button.textContent;
    button.disabled = false;
    button.classList.remove("is-busy");
  }
}

export function show(element, visible = true) {
  if (element) element.hidden = !visible;
}
