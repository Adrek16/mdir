import { env } from "../env.js";
import { clientIp, fail } from "../http.js";

/**
 * حماية مشتركة بين التشغيل المستقل ودوال Netlify.
 *
 * محلياً لا تُفعّل قائمة السماح ولا يُشترط الأصل، وتبقى الطلبات كما هي؛
 * وعلى الاستضافة العامة نتحقق من مصدر كل طلب تعديل ونقيّد الوصول اختيارياً.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * نُقارن اسم المضيف فقط لا المخطط: خلف CDN قد يكون x-forwarded-proto
 * مفقوداً أو مختلفاً، بينما يبقى المضيف هو الفاصل الموثوق بين موقعنا وأي
 * موقع خارجي. المتصفح يرسل Origin في كل طلب تعديل، والسكربتات لا ترسله.
 */
function requestHost(req) {
  const rawHost = req.headers["x-forwarded-host"] || req.headers.host || "";
  return String(rawHost).split(",")[0].trim().toLowerCase();
}

function configuredHost() {
  if (!env.publicSiteUrl) return "";
  try {
    return new URL(env.publicSiteUrl).host.toLowerCase();
  } catch {
    return "";
  }
}

export function webSecurity() {
  const extraHost = configuredHost();

  return (req, res, next) => {
    // قائمة عناوين IP اختيارية — حماية إضافية للوحة إدارية عامة.
    if (
      env.adminIpAllowlist.length > 0 &&
      !env.adminIpAllowlist.includes(clientIp(req))
    ) {
      return fail(res, 403, "الوصول غير مسموح من هذا العنوان");
    }

    if (!SAFE_METHODS.has(req.method)) {
      // المتصفح يخبرنا صراحةً بطلبات المواقع الخارجية.
      if (req.headers["sec-fetch-site"] === "cross-site") {
        return fail(res, 403, "طلب من مصدر خارجي مرفوض");
      }

      const origin = req.headers.origin;
      if (typeof origin === "string" && origin) {
        let candidate = "";
        try {
          candidate = new URL(origin).host.toLowerCase();
        } catch {
          candidate = "";
        }
        const host = requestHost(req);
        const same = Boolean(candidate) && (candidate === host || candidate === extraHost);
        if (!same) return fail(res, 403, "مصدر الطلب غير مطابق");
      }
    }

    next();
  };
}
