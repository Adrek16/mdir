/**
 * اختبار قبول الروابط التلقائية:
 *  - روابط التصنيفات رقمية: القسم + رقم متسلسل داخل القسم (perfumes-1).
 *  - روابط المنتجات رقمية: رابط التصنيف + رقم متسلسل داخل التصنيف (perfumes-1-3).
 *  - نقل منتج لتصنيف آخر يصرف رابطاً جديداً ويحوّل القديم (308).
 *  - تغيير قسم التصنيف يعيد ترقيمه هو وكل منتجاته ويحوّل الروابط القديمة.
 *  - الأرقام لا تُعاد بعد الحذف، وحقل name_en للمنتج لم يبق له أثر.
 *
 * التشغيل: npm run test:slugs
 */

import { adminCredentials, managerUrl, storeUrl, supabaseConfig } from "./config.mjs";

const manager = managerUrl();
const store = storeUrl();
const { supabaseUrl, serviceKey } = supabaseConfig();

const sbHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: Boolean(ok), extra });

const TIMEOUT = 20_000;

let cookie = "";

async function call(path, options = {}) {
  const response = await fetch(manager + path, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT),
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

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, payload };
}

/** إعادة المحاولة عند انقطاع الشبكة العابر (شبكة Supabase عبر CDN). */
async function sbFetch(url, init, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 700 * (i + 1)));
    }
  }
  throw lastError;
}

async function sb(path, options = {}) {
  const response = await sbFetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { ...sbHeaders, ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
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

async function storePage(path) {
  return fetch(store + path, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

function redirectTarget(response) {
  return response.headers.get("location") ?? "";
}

function maxSeq(categories, section) {
  const pattern = new RegExp(`^${section}-(\\d+)$`);
  return categories.reduce((max, item) => {
    const match = String(item.slug ?? "").match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

const stamp = Date.now();
const createdCategorySlugs = [];
const createdProductIds = [];
const watchedSlugs = new Set();

async function cleanup() {
  const out = {};

  if (createdProductIds.length) {
    out.products = (
      await sb(`products?id=in.(${createdProductIds.map(encodeURIComponent).join(",")})`, {
        method: "DELETE",
      })
    ).status;
  }

  if (createdCategorySlugs.length) {
    out.categories = (
      await sb(
        `categories?slug=in.(${createdCategorySlugs.map(encodeURIComponent).join(",")})`,
        { method: "DELETE" }
      )
    ).status;
  }

  if (watchedSlugs.size) {
    const slugs = [...watchedSlugs].map(encodeURIComponent).join(",");
    out.categoryHistory = (
      await sb(
        `category_slug_history?or=(old_slug.in.(${slugs}),new_slug.in.(${slugs}))`,
        { method: "DELETE" }
      )
    ).status;
    out.productHistory = (
      await sb(
        `product_slug_history?or=(old_slug.in.(${slugs}),new_slug.in.(${slugs}))`,
        { method: "DELETE" }
      )
    ).status;
  }

  return out;
}

try {
  const login = await call("/api/auth/login", {
    method: "POST",
    body: adminCredentials(),
  });
  check("login", login.status === 200);

  /* ── الشكل العام للروابط الحالية ────────────────────── */
  const list = await call("/api/categories");
  const categories = list.payload?.data?.categories ?? [];
  check(
    "all category slugs are section + number",
    categories.length >= 12 &&
      categories.every((item) => /^(perfumes|accessories|bags|general)-\d+$/.test(item.slug)),
    JSON.stringify(categories.map((item) => item.slug))
  );

  const productsList = await call("/api/products");
  const products = productsList.payload?.data?.products ?? [];
  check(
    "all product slugs are category slug + number",
    products.every((item) =>
      new RegExp(`^${item.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`).test(item.slug)
    ),
    JSON.stringify(products.map((item) => item.slug).slice(0, 8))
  );
  check(
    "product API no longer exposes nameEn",
    products.every((item) => !Object.prototype.hasOwnProperty.call(item, "nameEn"))
  );
  check(
    "product API no longer exposes slugs list",
    !Object.prototype.hasOwnProperty.call(productsList.payload?.data ?? {}, "slugs")
  );

  /* ── تصنيف جديد: القسم + الرقم التالي ──────────────── */
  const expectedCategorySlug = `perfumes-${maxSeq(categories, "perfumes") + 1}`;
  const createdCategory = await call("/api/categories", {
    method: "POST",
    body: {
      name: `تصنيف ترقيم ${stamp}`,
      nameEn: `Numbering QA ${stamp}`,
      parent: "perfumes",
      gender: "unisex",
      sortOrder: 9200,
    },
  });
  const category = createdCategory.payload?.data?.category;
  let categorySlug = category?.slug ?? null;
  if (categorySlug) {
    createdCategorySlugs.push(categorySlug);
    watchedSlugs.add(categorySlug);
  }

  check(
    "new category gets next number in its section",
    createdCategory.status === 201 && categorySlug === expectedCategorySlug,
    `expected=${expectedCategorySlug} got=${categorySlug}`
  );

  /* ── منتجان جديدان: ترقيم داخل التصنيف ─────────────── */
  async function createProduct(name) {
    const response = await call("/api/products", {
      method: "POST",
      body: {
        name,
        subtitle: "اختبار ترقيم",
        category: categorySlug,
        gender: "unisex",
        artwork: "necklace",
        price: 25,
        colors: [{ name: "ذهبي", hex: "#d4a857", stock: 2 }],
        tone: "#d4a857",
        active: true,
      },
    });
    const product = response.payload?.data?.product;
    if (product?.id) {
      createdProductIds.push(product.id);
      if (product.slug) watchedSlugs.add(product.slug);
    }
    return { status: response.status, product, payload: response.payload };
  }

  const first = await createProduct(`منتج ترقيم أول ${stamp}`);
  const firstSlug = first.product?.slug ?? null;
  check(
    "first product in category is category-1",
    first.status === 201 && firstSlug === `${categorySlug}-1`,
    `got=${firstSlug}`
  );

  const second = await createProduct(`منتج ترقيم ثانٍ ${stamp}`);
  const secondSlug = second.product?.slug ?? null;
  check(
    "second product in category is category-2",
    second.status === 201 && secondSlug === `${categorySlug}-2`,
    `got=${secondSlug}`
  );
  check(
    "product accepts no nameEn field",
    second.status === 201 &&
      !Object.prototype.hasOwnProperty.call(second.product ?? {}, "nameEn")
  );

  /* ── نقل منتج إلى تصنيف آخر ─────────────────────────── */
  const targetCategory = categories.find((item) => item.slug === "accessories-1")?.slug;
  check("target category exists", Boolean(targetCategory));

  const moveProduct = await call(`/api/products/${encodeURIComponent(second.product.id)}`, {
    method: "PATCH",
    body: { category: targetCategory },
  });
  const movedProduct = moveProduct.payload?.data?.product;
  const movedSlug = movedProduct?.slug ?? null;
  if (movedSlug) watchedSlugs.add(movedSlug);

  check(
    "moving product allocates a new slug in the new category",
    moveProduct.status === 200 &&
      movedProduct?.category === targetCategory &&
      new RegExp(`^${targetCategory}-\\d+$`).test(movedSlug ?? "") &&
      movedSlug !== secondSlug,
    `got=${movedSlug}`
  );

  const productHistory = (
    await sb(
      `product_slug_history?select=old_slug,new_slug&old_slug=eq.${encodeURIComponent(secondSlug)}`
    )
  ).data?.[0];
  check(
    "product move records old slug",
    productHistory?.new_slug === movedSlug,
    JSON.stringify(productHistory)
  );

  const movedOldResponse = await storePage(`/product/${secondSlug}`);
  check(
    "old product url redirects permanently",
    [301, 308].includes(movedOldResponse.status) &&
      redirectTarget(movedOldResponse).includes(movedSlug),
    `status=${movedOldResponse.status} location=${redirectTarget(movedOldResponse)}`
  );

  const firstUnchanged = await call("/api/products");
  const firstAfterMove = firstUnchanged.payload?.data?.products?.find(
    (item) => item.id === first.product.id
  );
  check(
    "moving one product leaves the other slug intact",
    firstAfterMove?.slug === firstSlug,
    `got=${firstAfterMove?.slug}`
  );

  /* ── تغيير قسم التصنيف ─────────────────────────────── */
  const beforeMoveCategorySlug = categorySlug;
  const accessoriesMax = maxSeq(categories, "accessories");
  const expectedMovedCategorySlug = `accessories-${accessoriesMax + 1}`;
  const moveCategory = await call(`/api/categories/${encodeURIComponent(categorySlug)}`, {
    method: "PATCH",
    body: { parent: "accessories", name: `تصنيف ترقيم منقول ${stamp}` },
  });
  const movedCategory = moveCategory.payload?.data?.category;
  const movedCategorySlug = movedCategory?.slug ?? null;
  if (movedCategorySlug) {
    createdCategorySlugs.push(movedCategorySlug);
    watchedSlugs.add(movedCategorySlug);
    categorySlug = movedCategorySlug;
  }

  check(
    "moving category renumbers it inside the new section",
    moveCategory.status === 200 &&
      movedCategorySlug === expectedMovedCategorySlug &&
      movedCategory?.parent === "accessories",
    `expected=${expectedMovedCategorySlug} got=${movedCategorySlug}`
  );

  const firstAfterCategoryMove = (
    await sb(`products?id=eq.${encodeURIComponent(first.product.id)}&select=slug,seq`)
  ).data?.[0];
  check(
    "category move re-prefixes its products",
    firstAfterCategoryMove?.slug === `${movedCategorySlug}-1`,
    JSON.stringify(firstAfterCategoryMove)
  );
  if (firstAfterCategoryMove?.slug) watchedSlugs.add(firstAfterCategoryMove.slug);

  const movedProductAfterCategory = (
    await sb(`products?id=eq.${encodeURIComponent(second.product.id)}&select=slug,category`)
  ).data?.[0];
  check(
    "category move does not touch products of other categories",
    movedProductAfterCategory?.slug === movedSlug,
    JSON.stringify(movedProductAfterCategory)
  );

  const categoryHistory = (
    await sb(
      `category_slug_history?select=old_slug,new_slug&old_slug=eq.${encodeURIComponent(beforeMoveCategorySlug)}`
    )
  ).data?.[0];
  check(
    "category move records old slug",
    categoryHistory?.new_slug === movedCategorySlug,
    JSON.stringify(categoryHistory)
  );

  const oldCategoryResponse = await storePage(`/category/${beforeMoveCategorySlug}`);
  check(
    "old category url redirects permanently",
    [301, 308].includes(oldCategoryResponse.status) &&
      redirectTarget(oldCategoryResponse).includes(movedCategorySlug),
    `status=${oldCategoryResponse.status} location=${redirectTarget(oldCategoryResponse)}`
  );

  const oldProductAfterCategory = await storePage(`/product/${firstSlug}`);
  check(
    "old product url redirects after category move",
    [301, 308].includes(oldProductAfterCategory.status) &&
      redirectTarget(oldProductAfterCategory).includes(`${movedCategorySlug}-1`),
    `status=${oldProductAfterCategory.status} location=${redirectTarget(oldProductAfterCategory)}`
  );

  /* ── لا إعادة استخدام للأرقام ──────────────────────── */
  const third = await createProduct(`منتج ترقيم ثالث ${stamp}`);
  check(
    "product numbering continues in moved category",
    third.status === 201 && third.product?.slug === `${movedCategorySlug}-2`,
    `got=${third.product?.slug} payload=${JSON.stringify(third.payload).slice(0, 400)}`
  );

  const deleteThird = await call(`/api/products/${encodeURIComponent(third.product.id)}`, {
    method: "DELETE",
  });
  createdProductIds.splice(createdProductIds.indexOf(third.product.id), 1);

  const fourth = await createProduct(`منتج ترقيم رابع ${stamp}`);
  check(
    "deleted product number is never reused",
    deleteThird.status === 200 && fourth.product?.slug === `${movedCategorySlug}-3`,
    `got=${fourth.product?.slug}`
  );

  /* ── الروابط الحيّة تُصيَّر بلا تحويل ───────────────── */
  const liveProduct = await storePage(`/product/${fourth.product.slug}`);
  check(
    "live product url renders",
    liveProduct.status === 200 && !redirectTarget(liveProduct),
    `status=${liveProduct.status} location=${redirectTarget(liveProduct)}`
  );
} catch (error) {
  check("unexpected error", false, String(error?.stack ?? error));
} finally {
  let cleaned = {};
  try {
    cleaned = await cleanup();
  } catch (error) {
    cleaned = { error: String(error?.message ?? error) };
  }
  const failed = results.filter((item) => !item.ok);
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}${item.ok ? "" : `  ::  ${item.extra}`}`);
  }
  console.log(`\ncleanup: ${JSON.stringify(cleaned)}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
