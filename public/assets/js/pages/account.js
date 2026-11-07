import { api, dom } from "../shared.js";

/**
 * صفحة «حسابي» — عرض البيانات وتغيير كلمة المرور واسم المستخدم.
 * كل العمليات تذهب إلى الخادم ولا تُخزَّن أي كلمة مرور في المتصفح.
 */

// ── عناصر بيانات الحساب ──
const infoBox = dom.$("#account-info");

// ── عناصر كلمة المرور ──
const pwForm = dom.$("#password-form");
const pwCurrent = dom.$("#pw-current");
const pwNew = dom.$("#pw-new");
const pwConfirm = dom.$("#pw-confirm");
const pwError = dom.$("#pw-error");
const pwSuccess = dom.$("#pw-success");
const pwSubmit = dom.$("#pw-submit");

// ── عناصر اسم المستخدم ──
const unForm = dom.$("#username-form");
const unInput = dom.$("#un-input");
const unError = dom.$("#un-error");
const unSuccess = dom.$("#un-success");
const unSubmit = dom.$("#un-submit");

// ── مساعدات العرض ──
function showMsg(box, msg, isError = false) {
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
  box.classList.toggle("m-form-error", isError);
  box.classList.toggle("m-form-success", !isError);
}

function hideMsg(box) {
  if (box) box.hidden = true;
}

function formatDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ── تحميل بيانات الحساب ──
async function loadAccount() {
  if (!infoBox) return;
  try {
    const data = await api.get("/api/account");
    const a = data.account;
    if (!a) {
      infoBox.innerHTML = '<div class="m-account-info__loading">تعذّر قراءة البيانات.</div>';
      return;
    }

    infoBox.innerHTML = `
      <div class="m-account-info__row">
        <span class="m-account-info__label">البريد الإلكتروني</span>
        <span class="m-account-info__value"><code>${a.email || "-"}</code></span>
      </div>
      <div class="m-account-info__row">
        <span class="m-account-info__label">اسم المستخدم</span>
        <span class="m-account-info__value"><code>${a.username || "—"}</code></span>
      </div>
      <div class="m-account-info__row">
        <span class="m-account-info__label">الاسم الكامل</span>
        <span class="m-account-info__value">${a.fullName || "—"}</span>
      </div>
      <div class="m-account-info__row">
        <span class="m-account-info__label">الدور</span>
        <span class="m-account-info__value"><span class="m-account-info__badge m-account-info__badge--admin">مدير</span></span>
      </div>
      <div class="m-account-info__row">
        <span class="m-account-info__label">تاريخ الإنشاء</span>
        <span class="m-account-info__value">${formatDate(a.createdAt)}</span>
      </div>
    `;

    // عبّئ حقل اسم المستخدم بالقيمة الحالية
    if (unInput && a.username) unInput.value = a.username;
  } catch (error) {
    infoBox.innerHTML = `<div class="m-account-info__loading">${error.message || "تعذّر قراءة البيانات"}</div>`;
  }
}

// ── تغيير كلمة المرور ──
pwForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMsg(pwError);
  hideMsg(pwSuccess);

  const current = pwCurrent?.value ?? "";
  const next = pwNew?.value ?? "";
  const confirm = pwConfirm?.value ?? "";

  if (!current || !next || !confirm) {
    showMsg(pwError, "املأ جميع الحقول", true);
    return;
  }

  if (next !== confirm) {
    showMsg(pwError, "كلمتا المرور الجديدتان غير متطابقتين", true);
    return;
  }

  if (next.length < 8) {
    showMsg(pwError, "كلمة المرور الجديدة قصيرة جداً (8 أحرف على الأقل)", true);
    return;
  }

  if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
    showMsg(pwError, "كلمة المرور يجب أن تحوي حروفاً وأرقاماً", true);
    return;
  }

  dom.setBusy(pwSubmit, true, "جارٍ التحديث…");

  try {
    await api.post("/api/account/password", { currentPassword: current, newPassword: next });
    showMsg(pwSuccess, "تم تغيير كلمة المرور بنجاح");
    pwForm?.reset();
  } catch (error) {
    showMsg(pwError, error.message || "تعذّر تغيير كلمة المرور", true);
  } finally {
    dom.setBusy(pwSubmit, false);
  }
});

// ── حفظ اسم المستخدم ──
unForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMsg(unError);
  hideMsg(unSuccess);

  const username = unInput?.value.trim() ?? "";
  if (!username) {
    showMsg(unError, "أدخل اسم المستخدم", true);
    return;
  }

  dom.setBusy(unSubmit, true, "جارٍ الحفظ…");

  try {
    const data = await api.post("/api/account/username", { username });
    showMsg(unSuccess, `تم حفظ اسم المستخدم: ${data.username}`);
    // حدّث حقل العرض أيضاً
    if (unInput) unInput.value = data.username;
    loadAccount();
  } catch (error) {
    showMsg(unError, error.message || "تعذّر حفظ اسم المستخدم", true);
  } finally {
    dom.setBusy(unSubmit, false);
  }
});

// ── إخفاء الرسائل عند الكتابة ──
pwCurrent?.addEventListener("input", () => { hideMsg(pwError); hideMsg(pwSuccess); });
pwNew?.addEventListener("input", () => { hideMsg(pwError); hideMsg(pwSuccess); });
pwConfirm?.addEventListener("input", () => { hideMsg(pwError); hideMsg(pwSuccess); });
unInput?.addEventListener("input", () => { hideMsg(unError); hideMsg(unSuccess); });

// ── بدء التحميل ──
loadAccount();
