/**
 * تنسيق الأرقام والتواريخ والجوال — أرقام لاتينية وتقويم ميلادي.
 */

const LOCALE = "ar-YE-u-ca-gregory-nu-latn";
const CURRENCY = "ر.ي";

const numberFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function num(value) {
  const parsed = Number(value);
  return numberFormatter.format(Number.isFinite(parsed) ? parsed : 0);
}

export function money(value) {
  return `${num(value)} ${CURRENCY}`;
}

export function date(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

export function dateTime(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

export function timeAgo(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  if (!parsed) return "—";
  const diff = Date.now() - parsed;

  const plural = (count, forms) => {
    if (count === 1) return forms.one;
    if (count === 2) return forms.two;
    if (count <= 10) return forms.few;
    return forms.many;
  };

  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) {
    return `قبل ${num(minutes)} ${plural(minutes, {
      one: "دقيقة",
      two: "دقيقتين",
      few: "دقائق",
      many: "دقيقة",
    })}`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `قبل ${num(hours)} ${plural(hours, {
      one: "ساعة",
      two: "ساعتين",
      few: "ساعات",
      many: "ساعة",
    })}`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return `قبل ${num(days)} ${plural(days, {
      one: "يوم",
      two: "يومين",
      few: "أيام",
      many: "يوماً",
    })}`;
  }

  return date(value);
}

/** 7xxxxxxxx → 9677xxxxxxxx */
export function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("967")) return digits;
  if (digits.startsWith("0")) return `967${digits.slice(1)}`;
  return digits;
}

export function telHref(phone) {
  return `tel:${String(phone ?? "").replace(/\s/g, "")}`;
}

export function whatsappHref(phone, text = "") {
  const number = normalizePhone(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}

/** اختصار معرّف الطلب للجداول: أول 8 + آخر 4 أحرف. */
export function shortId(value) {
  const id = String(value ?? "");
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
