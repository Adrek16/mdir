import { api } from "./api.js";
import { $, $$ } from "./dom.js";

/**
 * سلوك القشرة المشتركة: فتح/إغلاق السايدبار على الجوال، وتسجيل الخروج.
 * تُستدعى مرة واحدة من shell.js في كل صفحة محمية.
 */

export function initShell() {
  const overlay = $("#m-overlay");
  const body = document.body;

  const setSidebar = (open) => {
    body.classList.toggle("m-sidebar-open", open);
    if (overlay) overlay.hidden = !open;
  };

  $("[data-sidebar-toggle]")?.addEventListener("click", () => {
    setSidebar(!body.classList.contains("m-sidebar-open"));
  });

  overlay?.addEventListener("click", () => setSidebar(false));

  $$("[data-sidebar-close]").forEach((element) => {
    element.addEventListener("click", () => setSidebar(false));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSidebar(false);
  });

  $$("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await api.post("/api/auth/logout");
      } catch {
        /* الخروج محلياً حتى لو فشل الخادم */
      }
      location.href = "/login";
    });
  });
}
