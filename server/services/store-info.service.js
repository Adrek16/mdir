import { sbSelect } from "../supabase.js";

/**
 * معلومات المتجر — جدول `settings` (مفتاح → قيمة JSON).
 *
 * نفس مفتاح المتجر `store_info` حتى يرى العميل ما يحفظه المدير هنا،
 * ونفس قواعد التنظيف والتحقق حتى لا يختلف الطرفان.
 *
 * تقسيم العمل:
 *   - cleanStoreInfo(): مُنظِّف دفاعي، يُعيد دائماً كائناً كامل الشكل،
 *     ويُفرّغ أي قيمة غير آمنة بدل أن يرمي استثناءً.
 *   - saveStoreInfo(): يتحقق ويُعيد { ok, value } أو { ok:false, error }.
 *   - المسار (route) يتولّى الحفظ الفعلي ثم إبلاغ المتجر، حتى يُنفَّذان بترتيب واحد.
 */

const STORE_KEY = "store_info";

/** القيم الافتراضية المُ seeded في migration 008 (أسطر 62-87). */
export const DEFAULT_STORE_INFO = Object.freeze({
  name: "ستور",
  nameEn: "STOOR",
  tagline: "عطور وإكسسوارات وحقائب — رجالي ونسائي وأطفال",
  description:
    "متجر ستور للعطور والإكسسوارات والحقائب. عطور شرقية وفرنسية، سلاسل وأقراط وخواتم وساعات وحقائب، بجودة عالية واختيار بعناية.",
  about:
    "عطور شرقية وفرنسية وإكسسوارات مختارة بعناية — للرجال والنساء. جودة نتحمّل مسؤوليتها، وتغليف يليق بالهدية.",
  welcomeLine1: "بريقٌ يبقى،",
  welcomeLine2: "ورائحةٌ تُذكر.",
  welcomeBody:
    "قطع مختارة بعناية من العطور الشرقية والفرنسية، والإكسسوارات المعدنية، والحقائب الأنيقة — للرجال والنساء والأطفال. جودة نتحمّل مسؤوليتها، وتغليف يليق بالهدية.",
  workingHours: "من 9 صباحاً إلى 9 مساءً، طوال أيام الأسبوع",
  address: "صنعاء، اليمن",
  mapUrl: "",
  whatsapp: "967770000000",
  phone: "+967 77 000 0000",
  email: "hello@stoor.example",
  social: Object.freeze({ instagram: "", tiktok: "", snapchat: "", x: "" }),
  logoPath: "",
});

/** حدود أطوال الحقول النصية (تُطابق maxlength في النموذج). */
const CAPS = Object.freeze({
  name: 120,
  nameEn: 120,
  tagline: 200,
  description: 600,
  about: 600,
  welcomeLine1: 120,
  welcomeLine2: 120,
  welcomeBody: 600,
  workingHours: 160,
  address: 200,
  mapUrl: 500,
  whatsapp: 20,
  phone: 40,
  email: 120,
  social: 300,
  logoPath: 200,
});

const SOCIAL_KEYS = ["instagram", "tiktok", "snapchat", "x"];

/** بريد «فضفاض»: شيء@نطاق.امتداد — بلا مسافات. */
const LOOSE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** URL آمن: http/https فقط، وإلا سلسلة فارغة. */
function cleanUrl(value, max) {
  const text = str(value, max);
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? text : "";
  } catch {
    return "";
  }
}

/** مسار نسبي آمن داخل bucket — لا .. ولا / بادئة ولا رابط مطلق ولا شرطات مائلة عكسية. */
function cleanLogoPath(value) {
  const text = str(value, CAPS.logoPath);
  if (!text) return "";
  if (text.includes("..")) return "";
  if (text.includes("\\")) return "";
  if (text.startsWith("/")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return ""; // مخطط/رابط مطلق أو protocol-relative
  if (!/^[A-Za-z0-9_./-]+$/.test(text)) return ""; // أحرف مسار آمنة فقط
  return text;
}

/**
 * يُنظّف أي مدخل ويُعيد دائماً الكائن الكامل (كل المفاتيح موجودة).
 * القيم غير الآمنة تُفرَّغ بدل أن تُحفظ — لا يرمي أبداً.
 */
export function cleanStoreInfo(input) {
  const source = input && typeof input === "object" ? input : {};
  const socialSource =
    source.social && typeof source.social === "object" ? source.social : {};

  const social = {};
  for (const key of SOCIAL_KEYS) {
    social[key] = cleanUrl(socialSource[key], CAPS.social);
  }

  const email = str(source.email, CAPS.email);

  return {
    name: str(source.name, CAPS.name),
    nameEn: str(source.nameEn, CAPS.nameEn),
    tagline: str(source.tagline, CAPS.tagline),
    description: str(source.description, CAPS.description),
    about: str(source.about, CAPS.about),
    welcomeLine1: str(source.welcomeLine1, CAPS.welcomeLine1),
    welcomeLine2: str(source.welcomeLine2, CAPS.welcomeLine2),
    welcomeBody: str(source.welcomeBody, CAPS.welcomeBody),
    workingHours: str(source.workingHours, CAPS.workingHours),
    address: str(source.address, CAPS.address),
    mapUrl: cleanUrl(source.mapUrl, CAPS.mapUrl),
    whatsapp: str(source.whatsapp, CAPS.whatsapp).replace(/\D/g, ""),
    phone: str(source.phone, CAPS.phone),
    email: LOOSE_EMAIL.test(email) ? email : "",
    social,
    logoPath: cleanLogoPath(source.logoPath),
  };
}

function defaults() {
  return {
    ...DEFAULT_STORE_INFO,
    social: { ...DEFAULT_STORE_INFO.social },
  };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** معلومات المتجر المعروضة للعميل — تُعيد الافتراضيات عند أي خطأ/غياب صف. */
export async function getStoreInfo() {
  try {
    const rows = await sbSelect(
      "settings",
      `select=value&key=eq.${encodeURIComponent(STORE_KEY)}&limit=1`
    );
    const value = Array.isArray(rows) ? rows[0]?.value : null;
    if (!value || typeof value !== "object") return defaults();
    return cleanStoreInfo(value);
  } catch (error) {
    console.error("[store-info] تعذّر قراءة معلومات المتجر:", error?.message ?? error);
    return defaults();
  }
}

/**
 * يتحقق من المدخلات ويُعيد القيمة النظيفة.
 * يعيد { ok: true, value } أو { ok: false, error }.
 * الحفظ الفعلي (sbUpsert) يتولّاه المسار ليُبلِّغ المتجر بعده مباشرة.
 */
export async function saveStoreInfo(input) {
  const value = cleanStoreInfo(input);

  if (!value.name) {
    return { ok: false, error: "اسم المتجر مطلوب" };
  }

  // بدل تجاهل القيم غير الصالحة بصمت، نُخبر المدير بما يجب تصحيحه.
  if (nonEmpty(input?.mapUrl) && !value.mapUrl) {
    return { ok: false, error: "رابط الخريطة يجب أن يبدأ بـ http:// أو https://" };
  }
  if (SOCIAL_KEYS.some((key) => nonEmpty(input?.social?.[key]) && !value.social[key])) {
    return {
      ok: false,
      error: "روابط التواصل الاجتماعي يجب أن تبدأ بـ http:// أو https://",
    };
  }
  if (nonEmpty(input?.email) && !value.email) {
    return { ok: false, error: "البريد الإلكتروني غير صالح" };
  }
  if (nonEmpty(input?.logoPath) && !value.logoPath) {
    return { ok: false, error: "مسار الشعار غير صالح" };
  }

  return { ok: true, value };
}
