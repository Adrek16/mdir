import { api, dom } from "../shared.js";

/**
 * دخول المدير — التحقق كله على الخادم.
 * لا نحفظ كلمة المرور ولا الجلسة في التخزين المحلي.
 */

const form = dom.$("#login-form");
const identifierInput = dom.$("#login-identifier");
const passwordInput = dom.$("#login-password");
const nextInput = dom.$("#login-next");
const errorBox = dom.$("#login-error");
const submit = dom.$("#login-submit");

function showError(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  if (errorBox) errorBox.hidden = true;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const identifier = identifierInput?.value.trim() ?? "";
  const password = passwordInput?.value ?? "";

  if (!identifier || !password) {
    showError("أدخل البريد أو اسم المستخدم وكلمة المرور");
    return;
  }

  dom.setBusy(submit, true, "جارٍ الدخول…");

  try {
    const data = await api.post(
      "/api/auth/login",
      { identifier, password, next: nextInput?.value || "/dashboard" },
      { redirectOn401: false }
    );
    location.href = data.next || "/dashboard";
  } catch (error) {
    showError(error.message || "تعذّر تسجيل الدخول");
    dom.setBusy(submit, false);
    passwordInput?.focus();
    passwordInput?.select();
  }
});

identifierInput?.addEventListener("input", hideError);
passwordInput?.addEventListener("input", hideError);
