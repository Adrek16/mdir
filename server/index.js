import { app } from "./app.js";
import { env } from "./env.js";

/**
 * نقطة دخول الخادم المستقل: `npm start` / `npm run dev`، أو أي منصة
 * تستضيف عملية Node وتحقن PORT (تستمع على 0.0.0.0 في الإنتاج).
 *
 * على Netlify يُستورد app مباشرة من netlify/functions/api.mjs،
 * فلا يُستدعى listen داخل الدالة السيرفرلس.
 */

app.listen(env.port, env.host, () => {
  const shownHost = env.host === "0.0.0.0" ? "127.0.0.1" : env.host;
  console.log(`\n  لوحة مدير ستور تعمل على http://${shownHost}:${env.port}`);
  console.log(`  يستمع على: ${env.host}:${env.port}`);
  console.log(`  المتجر: ${env.storeUrl || "(غير مضبوط — زر المتجر مخفي)"}\n`);
});
