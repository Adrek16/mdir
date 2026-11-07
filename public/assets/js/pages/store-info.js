import { api, dom } from "../shared.js";

/**
 * معلومات المتجر: تحميل، تحقق مبدئي، حفظ، ورفع الشعار.
 *
 * الخادم يعيد التحقق دائماً — تحقق المتصفح هنا لتحسين التجربة فقط.
 * رفع الشعار لا يمرّ عبر `api.post` لأنها تُحوّل الجسم إلى JSON،
 * فتستخدم الدالة `uploadLogo` طلب `fetch` خاماً بجسم الملف نفسه.
 */

const { $, setBusy } = dom;

const form = $("#store-info-form");

const fields = {
  name: $("#si-name"),
  nameEn: $("#si-name-en"),
  tagline: $("#si-tagline"),
  description: $("#si-description"),
  welcomeLine1: $("#si-welcome-line1"),
  welcomeLine2: $("#si-welcome-line2"),
  welcomeBody: $("#si-welcome-body"),
  about: $("#si-about"),
  workingHours: $("#si-working-hours"),
  address: $("#si-address"),
  mapUrl: $("#si-map-url"),
  whatsapp: $("#si-whatsapp"),
  phone: $("#si-phone"),
  email: $("#si-email"),
  instagram: $("#si-instagram"),
  tiktok: $("#si-tiktok"),
  snapchat: $("#si-snapchat"),
  x: $("#si-x"),
};

const SOCIAL_KEYS = ["instagram", "tiktok", "snapchat", "x"];

const errorBox = $("#si-error");
const successBox = $("#si-success");
const saveButton = $("#si-save");
const reloadButton = $("#si-reload");

const logoInput = $("#si-logo-input");
const logoPreview = $("#si-logo-preview");
const logoEmpty = $("#si-logo-empty");
const logoRemove = $("#si-logo-remove");
const logoStatus = $("#si-logo-status");

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // نفس حد الـ bucket
const LOOSE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** مسار الشعار الحالي — يُرسل مع الحفظ ولا يتغيّر إلا برفع/إزالة. */
let logoPath = "";
/** رابط الشعار المحفوظ حالياً — للمعاينة وللرجوع إليه عند فشل رفع جديد. */
let logoUrl = "";

/* ── رسائل ─────────────────────────────────────────────── */

function showError(message) {
  if (successBox) successBox.hidden = true;
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

function setLogoStatus(message, tone = "") {
  if (!logoStatus) return;
  logoStatus.textContent = message || "";
  logoStatus.hidden = !message;
  logoStatus.classList.toggle("is-error", tone === "error");
  logoStatus.classList.toggle("is-ok", tone === "ok");
}

/* ── الشعار ────────────────────────────────────────────── */

function renderLogo(url) {
  if (!logoPreview) return;

  logoUrl = url || "";

  if (url) {
    logoPreview.src = url;
    logoPreview.hidden = false;
    if (logoEmpty) logoEmpty.hidden = true;
    if (logoRemove) logoRemove.hidden = false;
  } else {
    logoPreview.removeAttribute("src");
    logoPreview.hidden = true;
    if (logoEmpty) logoEmpty.hidden = false;
    if (logoRemove) logoRemove.hidden = true;
  }
}

/**
 * رفع الصورة كجسم خام إلى المسار المخصّص.
 * `api.post` تُرسل JSON، لذلك نستخدم fetch مباشرة هنا فقط.
 */
async function uploadLogo(file) {
  let response;
  try {
    response = await fetch("/api/store-info/logo", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": file.type },
      body: file,
    });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم — تحقّق من تشغيله");
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    throw new Error("انتهت الجلسة");
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "تعذّر رفع الشعار");
  }

  return payload.data;
}

logoInput?.addEventListener("change", async () => {
  const file = logoInput.files?.[0];
  if (!file) return;

  clearMessages();
  setLogoStatus("");

  if (!ALLOWED_TYPES.includes(file.type)) {
    setLogoStatus("نوع الصورة غير مدعوم — PNG أو JPEG أو WebP أو AVIF فقط", "error");
    logoInput.value = "";
    return;
  }
  if (file.size > MAX_LOGO_BYTES) {
    setLogoStatus("حجم الشعار يتجاوز الحد المسموح (2 ميغابايت)", "error");
    logoInput.value = "";
    return;
  }

  // نحفظ رابط الشعار المحفوظ قبل المعاينة المؤقتة، لنرجعه عند فشل الرفع.
  const savedLogoUrl = logoUrl;

  // معاينة فورية من الملف المحلي قبل انتهاء الرفع.
  const localUrl = URL.createObjectURL(file);
  renderLogo(localUrl);
  setLogoStatus("جارٍ رفع الشعار…");

  try {
    const data = await uploadLogo(file);
    logoPath = data.logoPath || "";
    // نعتمد الرابط العام القادم من الخادم؛ رابط الملف المحلي يُبطَل في finally.
    renderLogo(data.url || "");
    setLogoStatus("تم رفع الشعار — اضغط «حفظ» لتثبيته في المتجر", "ok");
    showSuccess("تم رفع الشعار. لا تنسَ الحفظ.");
  } catch (error) {
    // إرجاع المعاينة إلى الشعار المحفوظ سابقاً بدل تفريغها.
    renderLogo(savedLogoUrl);
    setLogoStatus(error.message || "تعذّر رفع الشعار", "error");
  } finally {
    URL.revokeObjectURL(localUrl);
    logoInput.value = "";
  }
});

logoRemove?.addEventListener("click", async () => {
  clearMessages();

  if (!logoPath) {
    renderLogo("");
    setLogoStatus("");
    return;
  }

  setBusy(logoRemove, true, "جارٍ الإزالة…");

  try {
    const data = await api.delete("/api/store-info/logo");
    logoPath = "";
    renderLogo("");
    setLogoStatus("تم إزالة الشعار", "ok");
    if (data?.info) fill(data.info, "");
    showSuccess("تم إزالة الشعار من المتجر");
  } catch (error) {
    setLogoStatus(error.message || "تعذّر إزالة الشعار", "error");
  } finally {
    setBusy(logoRemove, false);
  }
});

/* ── تحميل وتعبئة ──────────────────────────────────────── */

function fill(info, publicLogoUrl = "") {
  if (!info) return;

  for (const [key, input] of Object.entries(fields)) {
    if (!input) continue;
    if (SOCIAL_KEYS.includes(key)) {
      input.value = info.social?.[key] || "";
    } else {
      input.value = info[key] || "";
    }
  }

  logoPath = info.logoPath || "";

  // المعاينة تُبنى من رابط عام يعيده الخادم مع الإعدادات.
  if (publicLogoUrl) {
    renderLogo(publicLogoUrl);
  } else if (!logoPath) {
    renderLogo("");
  }
  // إن كان هناك مسار بلا رابط عام (قراءة قديمة) نُبقي المعاينة الحالية كما هي.
}

async function load() {
  setBusy(reloadButton, true, "جارٍ التحميل…");
  clearMessages();
  setLogoStatus("");

  try {
    const data = await api.get("/api/store-info");
    fill(data.info, data.logoUrl);
  } catch (error) {
    showError(error.message || "تعذّر تحميل معلومات المتجر");
  } finally {
    setBusy(reloadButton, false);
  }
}

/* ── التحقق والحفظ ─────────────────────────────────────── */

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessages();
  setLogoStatus("");

  const value = (input) => (input?.value || "").trim();

  const payload = {
    name: value(fields.name),
    nameEn: value(fields.nameEn),
    tagline: value(fields.tagline),
    description: value(fields.description),
    about: value(fields.about),
    welcomeLine1: value(fields.welcomeLine1),
    welcomeLine2: value(fields.welcomeLine2),
    welcomeBody: value(fields.welcomeBody),
    workingHours: value(fields.workingHours),
    address: value(fields.address),
    mapUrl: value(fields.mapUrl),
    whatsapp: value(fields.whatsapp).replace(/\D/g, ""),
    phone: value(fields.phone),
    email: value(fields.email),
    social: {
      instagram: value(fields.instagram),
      tiktok: value(fields.tiktok),
      snapchat: value(fields.snapchat),
      x: value(fields.x),
    },
    logoPath,
  };

  if (!payload.name) {
    fields.name?.focus();
    return showError("اسم المتجر مطلوب");
  }
  if (payload.mapUrl && !isHttpUrl(payload.mapUrl)) {
    fields.mapUrl?.focus();
    return showError("رابط الخريطة يجب أن يبدأ بـ http:// أو https://");
  }
  if (SOCIAL_KEYS.some((key) => payload.social[key] && !isHttpUrl(payload.social[key]))) {
    return showError("روابط التواصل الاجتماعي يجب أن تبدأ بـ http:// أو https://");
  }
  if (payload.email && !LOOSE_EMAIL.test(payload.email)) {
    fields.email?.focus();
    return showError("البريد الإلكتروني غير صالح");
  }
  if (payload.whatsapp && payload.whatsapp.length < 8) {
    fields.whatsapp?.focus();
    return showError("رقم واتساب قصير جداً — أدخل الرقم مع رمز الدولة");
  }

  setBusy(saveButton, true, "جارٍ الحفظ…");

  try {
    const data = await api.put("/api/store-info", payload);
    fill(data.info, logoUrl);
    showSuccess("تم حفظ معلومات المتجر وتحديث واجهة المتجر");
  } catch (error) {
    showError(error.message || "تعذّر حفظ معلومات المتجر");
  } finally {
    setBusy(saveButton, false);
  }
});

reloadButton?.addEventListener("click", load);

load();
