/** تحقّق يدوي من استمرارية صور المنتج (إنشاء → تعديل → مسح → حذف). */
const { signSession, SESSION_COOKIE } = await import("../server/session.js");

const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({
    uid: "00000000-0000-0000-0000-000000000000",
    email: "verify@local",
    role: "admin",
    iat: now,
    exp: now + 60 * 60 * 1000,
  })
)}`;

const base = `http://127.0.0.1:${process.env.PORT || 4100}`;

const json = (path, method, body) =>
  fetch(base + path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));

const results = [];
const check = (name, passed, detail = "") => {
  results.push(passed);
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const list = await fetch(base + "/api/products", { headers: { cookie } }).then((r) => r.json());
const cat = list.data.categories[0].slug;

const created = await json("/api/products", "POST", {
  name: "منتج التحقق الآلي",
  category: cat,
  gender: "unisex",
  artwork: "perfume",
  price: 120,
  stock: 8,
  tone: "#6d4a33",
  colors: [
    { name: "أحمر", hex: "#ff0000", stock: 5 },
    { name: "أزرق", hex: "#0000ff", stock: 3 },
  ],
  imagePath: "products/verify/main.webp",
  colorImages: { أحمر: ["products/verify/r1.webp", "products/verify/r2.webp"], أزرق: ["products/verify/b1.webp"] },
});
const id = created.j?.data?.product?.id;
check("إنشاء منتج بصور", created.s === 201 && Boolean(id));
check("الصورة الرئيسية محفوظة", created.j?.data?.product?.imagePath === "products/verify/main.webp",
  created.j?.data?.product?.imagePath);
check("صور الألوان محفوظة", JSON.stringify(created.j?.data?.product?.colorImages) ===
  JSON.stringify({ أحمر: ["products/verify/r1.webp", "products/verify/r2.webp"], أزرق: ["products/verify/b1.webp"] }),
  JSON.stringify(created.j?.data?.product?.colorImages));

const stockOnly = await json(`/api/products/${id}`, "PATCH", {
  stock: 9,
  colors: [
    { name: "أحمر", hex: "#ff0000", stock: 6 },
    { name: "أزرق", hex: "#0000ff", stock: 3 },
  ],
});
check("تعديل المخزون لا يمسح الصور",
  stockOnly.s === 200 && Object.keys(stockOnly.j?.data?.product?.colorImages ?? {}).length === 2,
  JSON.stringify(stockOnly.j?.data?.product?.colorImages));

const imagesOnly = await json(`/api/products/${id}`, "PATCH", {
  colorImages: { أحمر: ["products/verify/r3.webp"] },
});
check("تعديل الصور وحدها يُقبل بمفاتيح الألوان الحالية",
  imagesOnly.s === 200 && imagesOnly.j?.data?.product?.colorImages?.أحمر?.length === 1,
  JSON.stringify(imagesOnly.j?.data?.product?.colorImages));

const tooMany = await json(`/api/products/${id}`, "PATCH", {
  colorImages: { أحمر: ["1", "2", "3", "4", "5", "6"] },
});
check("يرفض أكثر من 5 صور للون", tooMany.s === 400 && tooMany.j?.ok === false, tooMany.j?.error);

const cleared = await json(`/api/products/${id}`, "PATCH", { imagePath: "", colorImages: {} });
check("المسح يفرّغ الصور", cleared.s === 200 &&
  !cleared.j?.data?.product?.imagePath &&
  Object.keys(cleared.j?.data?.product?.colorImages ?? {}).length === 0,
  JSON.stringify({ ip: cleared.j?.data?.product?.imagePath, ci: cleared.j?.data?.product?.colorImages }));

const removed = await fetch(`${base}/api/products/${id}`, { method: "DELETE", headers: { cookie } });
check("حذف منتج الاختبار", removed.ok, `status=${removed.status}`);

const failed = results.filter((r) => !r).length;
console.log(`\n── ${results.length - failed}/${results.length} نجحت ──`);
process.exit(failed ? 1 : 0);
