import { fail } from "../http.js";

/**
 * توحيد جسم الطلب داخل Netlify Functions.
 *
 * `serverless-http` يبني كائن IncomingMessage بـ `complete: true` ويضع الجسم
 * مباشرة في `req.body` كـ Buffer. أما body-parser 2 (المرافق لـ Express 5)
 * فيتخطى القراءة فوراً عندما يرى الطلب «منتهياً»، فتبقى `req.body` بايتات
 * خاماً ولا يصل أي JSON إلى المسارات — كانت كل محاولات الدخول تُرجع
 * «أدخل البريد وكلمة المرور» رغم إرسال البيانات.
 *
 * نحلّل JSON يدوياً هنا، ونترك أجسام الصور/الملفات كما هي (Buffer) لأن
 * مسارات الرفع تقرأ `req.body` مباشرة. على الخادم المستقل لا يوجد Buffer،
 * فيتولى express.json / express.raw العمل كالمعتاد.
 */

const MAX_JSON_BYTES = 100 * 1024; // نفس حد express.json
const MAX_RAW_BYTES = 6 * 1024 * 1024; // حد آمن لرفع الصور

export function normalizeServerlessBody() {
  return (req, res, next) => {
    const raw = req.body;

    // خادم Node عادي: لا نتدخل، body-parser يقرأ التيار بنفسه.
    if (!Buffer.isBuffer(raw)) return next();

    if (raw.length === 0) {
      req.body = undefined;
      return next();
    }

    if (raw.length > MAX_RAW_BYTES) {
      return fail(res, 413, "حجم الطلب كبير جداً");
    }

    const type = String(req.headers["content-type"] || "").toLowerCase();
    if (!type.includes("application/json")) return next();

    if (raw.length > MAX_JSON_BYTES) {
      return fail(res, 413, "حجم الطلب كبير جداً");
    }

    try {
      req.body = JSON.parse(raw.toString("utf8"));
    } catch {
      return fail(res, 400, "صيغة JSON غير صالحة");
    }

    return next();
  };
}
