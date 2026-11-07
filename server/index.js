import { app } from "./app.js";
import { env } from "./env.js";

/**
 * نقطة الدخول للتشغيل المحلي فقط: `npm start` / `npm run dev`.
 * على Netlify يُستورد app مباشرة من netlify/functions/api.mjs،
 * فلا يُستدعى listen داخل الدالة السيرفرلس.
 */

app.listen(env.port, env.host, () => {
  console.log(`\n  لوحة مدير ستور تعمل على http://${env.host}:${env.port}`);
  console.log(`  المتجر: ${env.storeUrl}\n`);
});
