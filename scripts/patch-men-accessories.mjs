import fs from "node:fs";
import path from "node:path";
const { signSession, SESSION_COOKIE } = await import("../server/session.js");

const base = `http://127.0.0.1:${process.env.PORT || 4100}`;
const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({ uid: "00000000-0000-0000-0000-000000000000", email: "seed@local", role: "admin", iat: now, exp: now + 3600_000 })
)}`;

const images = {
  watch: "C:/Users/L/Desktop/stoor/.tmp-joj-images/extra/watch-190819.jpg",
  tie: "C:/Users/L/Desktop/stoor/.tmp-joj-images/extra/cufflinks-45055.jpg",
};

async function upload(file) {
  const bytes = fs.readFileSync(file);
  const res = await fetch(`${base}/api/products/upload?scope=main`, {
    method: "POST",
    headers: { cookie, "content-type": "image/jpeg" },
    body: bytes,
  });
  const j = await res.json();
  if (!j.ok) throw new Error(JSON.stringify(j));
  console.log("uploaded", path.basename(file), "→", j.data.path);
  return j.data.path;
}

const json = async (method, url, body) => {
  const r = await fetch(base + url, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const watchPath = await upload(images.watch);
const watch = await json("PATCH", "/api/products/a-501", {
  imagePath: watchPath,
  colors: [
    { name: "فضي", hex: "#c0c0c0", stock: 9 },
    { name: "ذهبي", hex: "#d4af37", stock: 5 },
  ],
});
console.log("a-501", watch.status, watch.json?.ok);

const tiePath = await upload(images.tie);
const tie = await json("PATCH", "/api/products/a-504", {
  name: "ربطة عنق حريرية",
  subtitle: "ربطة عنق كلاسيكية بنقشة هندسية",
  imagePath: tiePath,
  description: "ربطة عنق حريرية بنقشة هندسية دقيقة، مناسبة للعمل والمناسبات الرسمية.",
  colors: [
    { name: "كحلي", hex: "#1f3a5f", stock: 20 },
    { name: "أسود", hex: "#1a1a1a", stock: 13 },
  ],
});
console.log("a-504", tie.status, tie.json?.ok, tie.json?.data?.product?.name);

const cat = await json("PATCH", "/api/categories/accessories-9", {
  name: "ربطات عنق",
  nameEn: "Ties",
});
console.log("category", cat.status, cat.json?.ok, cat.json?.data?.category?.name || cat.json?.error);
