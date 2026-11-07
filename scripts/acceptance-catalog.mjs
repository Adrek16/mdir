const manager = "http://127.0.0.1:4100";
const store = "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("missing env");
  process.exit(2);
}

const sbHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

let cookie = "";
const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok, extra });

async function call(path, options = {}) {
  const response = await fetch(manager + path, {
    ...options,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  for (const item of response.headers.getSetCookie?.() || []) {
    if (item.startsWith("stoor_manager=")) cookie = item.split(";")[0];
  }

  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function sb(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...sbHeaders,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

const stamp = Date.now();
const productName = `منتج ألوان ${stamp}`;
let productId = null;
let productSlug = null;
let categorySlug = null;
let previousCategorySlug = null;

async function cleanup() {
  const out = {};
  if (productId) {
    out.product = (await sb(`products?id=eq.${encodeURIComponent(productId)}`, { method: "DELETE" })).status;
  }
  if (categorySlug) {
    out.category = (await sb(`categories?slug=eq.${encodeURIComponent(categorySlug)}`, { method: "DELETE" })).status;
  }

  const slugs = [categorySlug, previousCategorySlug, productSlug].filter(Boolean);
  if (slugs.length) {
    const list = slugs.map(encodeURIComponent).join(",");
    out.categoryHistory = (
      await sb(`category_slug_history?or=(old_slug.in.(${list}),new_slug.in.(${list}))`, {
        method: "DELETE",
      })
    ).status;
    out.productHistory = (
      await sb(`product_slug_history?or=(old_slug.in.(${list}),new_slug.in.(${list}))`, {
        method: "DELETE",
      })
    ).status;
  }

  return out;
}

try {
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: "admin@stoor.local", password: "Stoor@Dev2026" },
  });
  check("login", login.status === 200);

  /* ── التصنيفات: القراءة ─────────────────────────────── */
  const list = await call("/api/categories");
  const data = list.payload?.data;
  check(
    "list categories + stats",
    list.status === 200 &&
      Array.isArray(data?.categories) &&
      data.categories.length >= 12 &&
      typeof data?.stats?.total === "number" &&
      data.stats.total === data.categories.length &&
      data.categories.every((item) => typeof item.productCount === "number"),
    JSON.stringify(list.payload).slice(0, 250)
  );
  check(
    "category stats consistent",
    data?.stats?.total === data?.stats?.withProducts + data?.stats?.empty &&
      data?.stats?.withoutParent === data?.categories?.filter((item) => !item.parent).length,
    JSON.stringify(data?.stats)
  );

  /* ── التصنيفات: التحقق ──────────────────────────────── */
  const badName = await call("/api/categories", { method: "POST", body: { name: "أ" } });
  check("category short name -> 400", badName.status === 400, JSON.stringify(badName.payload));

  const badParent = await call("/api/categories", {
    method: "POST",
    body: { name: "اسم صالح", parent: "nope" },
  });
  check("category unknown parent -> 400", badParent.status === 400, JSON.stringify(badParent.payload));

  /* ── التصنيفات: الإنشاء ─────────────────────────────── */
  const created = await call("/api/categories", {
    method: "POST",
    body: {
      name: `تصنيف اختبار ${stamp}`,
      nameEn: `QA Category ${stamp}`,
      parent: "perfumes",
      gender: "unisex",
      blurb: "تصنيف مؤقت للاختبار الآلي",
      sortOrder: 9000,
    },
  });
  categorySlug = created.payload?.data?.category?.slug ?? null;
  check(
    "create category -> 201 with automatic slug",
    created.status === 201 &&
      /^perfumes-\d+$/.test(categorySlug ?? "") &&
      created.payload.data.category.parent === "perfumes" &&
      created.payload.data.category.gender === "unisex",
    JSON.stringify(created.payload).slice(0, 250)
  );

  const afterCreate = await call("/api/categories");
  const createdRow = afterCreate.payload?.data?.categories?.find((item) => item.slug === categorySlug);
  check("created category has zero products", Boolean(createdRow) && createdRow.productCount === 0);

  /* ── المنتج المرتبط + الألوان ───────────────────────── */
  const product = await call("/api/products", {
    method: "POST",
    body: {
      name: productName,
      subtitle: "اختبار مخزون الألوان",
      category: categorySlug,
      gender: "unisex",
      artwork: "necklace",
      price: 50,
      colors: [
        { name: "ذهبي", hex: "#d4a857", stock: 5 },
        { name: "فضي", hex: "#c3c6c9", stock: 7 },
      ],
      tone: "#d4a857",
      active: true,
    },
  });
  productId = product.payload?.data?.product?.id ?? null;
  productSlug = product.payload?.data?.product?.slug ?? null;
  const createdProduct = product.payload?.data?.product;
  check(
    "create product with colors -> total 12",
    product.status === 201 &&
      Boolean(productId) &&
      productSlug === `${categorySlug}-1` &&
      createdProduct.stock === 12 &&
      createdProduct.colors?.length === 2 &&
      createdProduct.colors[0].stock === 5 &&
      createdProduct.colors[1].stock === 7,
    JSON.stringify(product.payload).slice(0, 300)
  );

  check(
    "linked category counts product",
    (await call("/api/categories")).payload?.data?.categories?.find((item) => item.slug === categorySlug)
      ?.productCount === 1
  );

  /* ── الألوان: التحقق ────────────────────────────────── */
  const dupColors = await call("/api/products", {
    method: "POST",
    body: {
      name: "تكرار الألوان",
      category: categorySlug,
      gender: "unisex",
      price: 10,
      colors: [
        { name: "ذهبي", hex: "#d4a857", stock: 1 },
        { name: "ذهبي", hex: "#000000", stock: 1 },
      ],
      tone: "#d4a857",
    },
  });
  check("duplicate color names -> 400", dupColors.status === 400, JSON.stringify(dupColors.payload));

  const badHex = await call("/api/products", {
    method: "POST",
    body: {
      name: "لون خاطئ",
      category: categorySlug,
      gender: "unisex",
      price: 10,
      colors: [{ name: "ذهبي", hex: "ذهب", stock: 1 }],
      tone: "#d4a857",
    },
  });
  check("invalid color hex -> 400", badHex.status === 400, JSON.stringify(badHex.payload));

  const badStock = await call("/api/products", {
    method: "POST",
    body: {
      name: "مخزون سالب",
      category: categorySlug,
      gender: "unisex",
      price: 10,
      colors: [{ name: "ذهبي", hex: "#d4a857", stock: -2 }],
      tone: "#d4a857",
    },
  });
  check("negative color stock -> 400", badStock.status === 400, JSON.stringify(badStock.payload));

  /* ── الألوان: التعديل يحدّث المجموع ─────────────────── */
  const patched = await call(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: {
      colors: [
        { name: "ذهبي", hex: "#d4a857", stock: 2 },
        { name: "فضي", hex: "#c3c6c9", stock: 3 },
        { name: "روز", hex: "#e0a996", stock: 4 },
      ],
    },
  });
  check(
    "patch colors -> total 9 + three colors",
    patched.status === 200 &&
      patched.payload.data.product.stock === 9 &&
      patched.payload.data.product.colors.length === 3 &&
      patched.payload.data.product.colors[2].stock === 4,
    JSON.stringify(patched.payload).slice(0, 300)
  );

  /* ── المتجر يعرض مخزون اللون ────────────────────────── */
  const storePage = await fetch(`${store}/product/${productSlug}`);
  const storeHtml = await storePage.text();
  check(
    "storefront shows per-color stock",
    storePage.status === 200 &&
      storeHtml.includes(productName) &&
      storeHtml.includes("المتوفر") &&
      storeHtml.includes("روز"),
    `status=${storePage.status}`
  );

  /* ── قاعدة البيانات: الحجز والتحرير حسب اللون ───────── */
  const before = (await sb(`products?id=eq.${encodeURIComponent(productId)}&select=stock,colors`)).data?.[0];
  const reserve = await sb("rpc/reserve_stock", {
    method: "POST",
    body: { lines: [{ productId, qty: 2, color: "ذهبي" }] },
  });
  const afterReserve = (await sb(`products?id=eq.${encodeURIComponent(productId)}&select=stock,colors`)).data?.[0];
  const goldAfter = afterReserve?.colors?.find((color) => color.name === "ذهبي")?.stock;
  check(
    "reserve_stock deducts color + total",
    reserve.status === 204 &&
      before?.stock === 9 &&
      afterReserve?.stock === 7 &&
      goldAfter === 0,
    JSON.stringify({ before, afterReserve }).slice(0, 300)
  );

  const overColor = await sb("rpc/reserve_stock", {
    method: "POST",
    body: { lines: [{ productId, qty: 1, color: "ذهبي" }] },
  });
  check(
    "reserve more than color stock -> OUT_OF_STOCK",
    overColor.status >= 400 && String(overColor.data?.message ?? "").includes("OUT_OF_STOCK"),
    JSON.stringify(overColor).slice(0, 200)
  );

  const totalUnchanged = (await sb(`products?id=eq.${encodeURIComponent(productId)}&select=stock`)).data?.[0];
  check("failed reserve leaves total intact", totalUnchanged?.stock === 7);

  const release = await sb("rpc/release_stock", {
    method: "POST",
    body: { lines: [{ productId, qty: 2, color: "ذهبي" }] },
  });
  const afterRelease = (await sb(`products?id=eq.${encodeURIComponent(productId)}&select=stock,colors`)).data?.[0];
  check(
    "release_stock restores color + total",
    release.status === 204 &&
      afterRelease?.stock === 9 &&
      afterRelease?.colors?.find((color) => color.name === "ذهبي")?.stock === 2,
    JSON.stringify(afterRelease).slice(0, 300)
  );

  /* ── التصنيفات: التعديل وتغيير القسم ─────────────────── */
  previousCategorySlug = categorySlug;
  const moved = await call(`/api/categories/${encodeURIComponent(categorySlug)}`, {
    method: "PATCH",
    body: {
      name: `تصنيف معدل ${stamp}`,
      parent: "accessories",
      sortOrder: 9100,
      blurb: "وصف معدل",
    },
  });
  const movedCategory = moved.payload?.data?.category;
  check(
    "move category to another section -> automatic new slug",
    moved.status === 200 &&
      /^accessories-\d+$/.test(movedCategory?.slug ?? "") &&
      movedCategory?.slug !== previousCategorySlug &&
      movedCategory?.sortOrder === 9100 &&
      movedCategory?.parent === "accessories",
    JSON.stringify(moved.payload).slice(0, 250)
  );
  categorySlug = movedCategory?.slug ?? null;

  const productAfterMove = (
    await sb(`products?id=eq.${encodeURIComponent(productId)}&select=category,slug,seq`)
  ).data?.[0];
  check(
    "product follows moved category and gets new slug",
    productAfterMove?.category === categorySlug &&
      productAfterMove?.slug === `${categorySlug}-1`,
    JSON.stringify(productAfterMove)
  );

  const oldCat = await call(`/api/categories/${encodeURIComponent(previousCategorySlug)}`, {
    method: "PATCH",
    body: { name: "لا يوجد" },
  });
  check("patch missing category -> 404", oldCat.status === 404, JSON.stringify(oldCat.payload));

  const oldCategoryRedirect = await fetch(`${store}/category/${previousCategorySlug}`, {
    redirect: "manual",
  });
  check(
    "old category url redirects after section move",
    [301, 308].includes(oldCategoryRedirect.status) &&
      (oldCategoryRedirect.headers.get("location") ?? "").includes(categorySlug),
    `status=${oldCategoryRedirect.status} location=${oldCategoryRedirect.headers.get("location") ?? ""}`
  );

  /* ── التصنيفات: الحذف المحمي ────────────────────────── */
  const deleteFilled = await call(`/api/categories/${encodeURIComponent(categorySlug)}`, { method: "DELETE" });
  check(
    "delete category with products -> 409",
    deleteFilled.status === 409,
    JSON.stringify(deleteFilled.payload)
  );

  const deleteProduct = await call(`/api/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
  check("delete test product -> 200", deleteProduct.status === 200);
  productId = null;

  const deleteEmpty = await call(`/api/categories/${encodeURIComponent(categorySlug)}`, { method: "DELETE" });
  check("delete empty category -> 200", deleteEmpty.status === 200 && deleteEmpty.payload.data.deleted === true);
  categorySlug = null;

  const finalList = await call("/api/categories");
  check(
    "deleted category gone from list",
    !finalList.payload?.data?.categories?.some(
      (item) => item.slug === movedCategory?.slug
    )
  );

  const deleteMissing = await call(`/api/categories/${encodeURIComponent(movedCategory?.slug ?? "")}`, { method: "DELETE" });
  check("delete missing category -> 404", deleteMissing.status === 404);
} finally {
  console.log("cleanup:", JSON.stringify(await cleanup()));
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} category + color checks passed`);
for (const item of failed) console.log("FAIL:", item.name, item.extra || "");
if (failed.length) process.exitCode = 1;
