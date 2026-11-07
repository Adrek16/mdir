import fs from "node:fs";
import path from "node:path";
const { signSession, SESSION_COOKIE } = await import("../server/session.js");

const { localManagerUrl } = await import("./config.mjs");
const base = localManagerUrl();
const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({ uid: "00000000-0000-0000-0000-000000000000", email: "seed@local", role: "admin", iat: now, exp: now + 3600_000 })
)}`;

const list = await fetch(`${base}/api/products?page=1&pageSize=100`, { headers: { cookie } }).then((r) => r.json());
const product = (list.data?.products || []).find((p) => p.slug === "accessories-1-3");
if (!product) throw new Error("product not found");

const file = "C:/Users/L/Desktop/stoor/.tmp-joj-images/56.jpg";
const bytes = fs.readFileSync(file);
const up = await fetch(`${base}/api/products/upload?scope=main`, {
  method: "POST",
  headers: { cookie, "content-type": "image/jpeg" },
  body: bytes,
});
const upJson = await up.json();
if (!upJson.ok) throw new Error(JSON.stringify(upJson));
console.log("uploaded", path.basename(file), "→", upJson.data.path);

const patch = await fetch(`${base}/api/products/${product.id}`, {
  method: "PATCH",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ imagePath: upJson.data.path }),
});
const j = await patch.json();
console.log("patch", patch.status, j.ok, j.data?.product?.name, j.data?.product?.imagePath);
