const { signSession, SESSION_COOKIE } = await import("../server/session.js");
const base = `http://127.0.0.1:${process.env.PORT || 4100}`;
const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({ uid: "00000000-0000-0000-0000-000000000000", email: "audit@local", role: "admin", iat: now, exp: now + 3600_000 })
)}`;

const get = (p) => fetch(base + p, { headers: { cookie } }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));

const products = await get("/api/products?page=1&pageSize=100");
const list = products.j?.data?.products ?? [];
const cats = await get("/api/categories");
const catList = cats.j?.data?.categories ?? [];

console.log("products", products.s, list.length);
console.log("withImage", list.filter((p) => p.imagePath).length, "active", list.filter((p) => p.active !== false).length);
console.log("categories", cats.s, catList.length);
console.log("perCategory", catList.map((c) => `${c.name}:${list.filter((p) => p.category === c.slug).length}`).join("  "));
console.log("types", [...new Set(list.map((p) => p.artwork))].join(","));
