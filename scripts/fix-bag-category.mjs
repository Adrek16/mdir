const { signSession, SESSION_COOKIE } = await import("../server/session.js");
const { localManagerUrl } = await import("./config.mjs");
const base = localManagerUrl();
const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({ uid: "00000000-0000-0000-0000-000000000000", email: "seed@local", role: "admin", iat: now, exp: now + 3600_000 })
)}`;

const json = async (method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const created = await json("POST", "/api/categories", {
  name: "حقائب",
  nameEn: "Bags",
  parent: "bags",
  blurb: "حقائب وقطع هدايا مختارة",
});
console.log("category", created.status, JSON.stringify(created.json));
const slug = created.json?.data?.category?.slug;
if (!slug) process.exit(1);

const list = await json("GET", "/api/products?query=" + encodeURIComponent("حقيبة أمجاد"));
const products = list.json?.data?.products || [];
console.log("products", products.map((p) => ({ id: p.id, name: p.name, category: p.category })));
const bag = products.find((p) => p.name === "حقيبة أمجاد");
if (bag) {
  const moved = await json("PATCH", `/api/products/${bag.id}`, { category: slug });
  console.log("move", moved.status, moved.json?.ok, moved.json?.data?.product?.category);
}
