import { randomUUID } from "node:crypto";
import { sbSelect, sbUpsert } from "../supabase.js";

/**
 * طرق الدفع — مفتاح `payment_methods` في جدول `settings`.
 *
 * قائمة يديرها المدير: بنوك ومحافظ محلية (جوالي، جيب، حاسب، فلوسك، ون كاش…).
 * نفس الشكل يقرأه المتجر في `GET /api/checkout/config`، فالطرفان متطابقان.
 *
 * توافق خلفي: إن لم توجد القائمة وكانت هناك بيانات `bank_transfer` قديمة،
 * تُحوَّل إلى عنصر بنكي واحد عند أول قراءة.
 */

const METHODS_KEY = "payment_methods";
const LEGACY_BANK_KEY = "bank_transfer";
const MAX_METHODS = 10;

export const PAYMENT_TYPE_LABEL = Object.freeze({
  bank: "بنك",
  wallet: "محفظة",
});

const str = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function newId() {
  return `pm_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function cleanMethod(input, index) {
  const type = input?.type === "wallet" ? "wallet" : "bank";
  return {
    id: str(input?.id, 60) || newId(),
    type,
    name: str(input?.name, 80),
    accountName: str(input?.accountName, 120),
    accountNumber: str(input?.accountNumber, 60),
    note: str(input?.note, 300),
    active: input?.active !== false,
    sort: Number.isFinite(Number(input?.sort)) ? Number(input.sort) : index + 1,
  };
}

/** قائمة نظيفة ومرتّبة — لا تكرار معرّفات. */
function cleanList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const list = [];

  raw.slice(0, MAX_METHODS).forEach((item, index) => {
    const method = cleanMethod(item, index);
    if (!method.name) return;
    if (seen.has(method.id)) method.id = newId();
    seen.add(method.id);
    list.push(method);
  });

  return list
    .sort((a, b) => a.sort - b.sort)
    .map((method, index) => ({ ...method, sort: index + 1 }));
}

function legacyToMethod(bank) {
  const iban = str(bank?.iban, 34).replace(/\s+/g, "").toUpperCase();
  if (!iban) return null;
  return {
    id: "pm_bank_legacy",
    type: "bank",
    name: str(bank?.bankName, 80) || "تحويل بنكي",
    accountName: str(bank?.accountName, 120),
    accountNumber: iban,
    note: str(bank?.note, 300),
    active: true,
    sort: 1,
  };
}

async function readKey(key) {
  const rows = await sbSelect(
    "settings",
    `select=value&key=eq.${encodeURIComponent(key)}&limit=1`
  );
  return Array.isArray(rows) ? rows[0]?.value ?? null : null;
}

async function saveKey(key, value) {
  await sbUpsert("settings", [{ key, value }], "key");
}

/** الطرق المعروضة للعميل — المفعّلة فقط، مرتّبة. */
export async function getActivePaymentMethods() {
  const methods = await getPaymentMethods();
  return methods.filter((method) => method.active);
}

export async function getPaymentMethods() {
  try {
    const stored = await readKey(METHODS_KEY);
    const list = cleanList(stored);

    // توافق خلفي: قائمة فارغة + بيانات بنك قديمة → نحوّلها مرة واحدة.
    if (list.length === 0) {
      const legacy = legacyToMethod(await readKey(LEGACY_BANK_KEY));
      if (legacy) {
        await saveKey(METHODS_KEY, [legacy]);
        return [legacy];
      }
    }

    return list;
  } catch (error) {
    console.error("[settings] تعذّر قراءة طرق الدفع:", error?.message ?? error);
    return [];
  }
}

/**
 * يتحقق من القائمة قبل الحفظ.
 * يعيد { ok: true, value } أو { ok: false, error }.
 */
export function validatePaymentMethods(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: "صيغة طرق الدفع غير صحيحة" };
  }
  if (input.length > MAX_METHODS) {
    return { ok: false, error: `الحد الأقصى ${MAX_METHODS} طرق دفع` };
  }

  const value = cleanList(input);

  for (const method of value) {
    if (!method.name) {
      return { ok: false, error: "اسم كل طريقة دفع مطلوب" };
    }
    if (!method.accountNumber) {
      return { ok: false, error: `رقم الحساب مطلوب لـ «${method.name}»` };
    }
    if (method.type === "bank" && !method.accountName) {
      return { ok: false, error: `اسم صاحب الحساب مطلوب لـ «${method.name}»` };
    }
  }

  if (value.length > 0 && !value.some((method) => method.active)) {
    return { ok: false, error: "أبقِ طريقة واحدة مفعّلة على الأقل" };
  }

  return { ok: true, value };
}

export async function savePaymentMethods(input) {
  const checked = validatePaymentMethods(input);
  if (!checked.ok) return checked;

  await saveKey(METHODS_KEY, checked.value);
  return checked;
}
