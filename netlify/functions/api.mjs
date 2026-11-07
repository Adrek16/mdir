import serverless from "serverless-http";
import { app } from "../../server/app.js";

/**
 * مدخل Netlify Functions للوحة المدير.
 *
 * netlify.toml يوجّه إليه كل طلب لا يقابله ملف ثابت، فيبقى Express
 * مسؤولاً عن صفحات EJS وواجهات /api/* والجلسات الموقّعة كما هو محلياً.
 */
export const handler = serverless(app);
