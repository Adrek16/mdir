/**
 * إضافة منتجات جوج و العربية للعود إلى المتجر **عبر واجهة المدير**.
 *
 * يشغّل: npm run seed:joj  (أو node --env-file=.env scripts/seed-joj-products.mjs)
 *
 * الخطوات: رفع الصور إلى bucket product-images عبر /api/products/upload،
 * ثم إنشاء منتجات جديدة وتحديث المنتجات الحالية التي بلا صور.
 * كل الطلبات تمرّ على خادم المدير، لا SQL مباشر.
 */
import fs from "node:fs";
import path from "node:path";

const { signSession, SESSION_COOKIE } = await import("../server/session.js");

const { localManagerUrl } = await import("./config.mjs");
const base = localManagerUrl();
const now = Date.now();
const cookie = `${SESSION_COOKIE}=${encodeURIComponent(
  signSession({ uid: "00000000-0000-0000-0000-000000000000", email: "seed@local", role: "admin", iat: now, exp: now + 3 * 60 * 60 * 1000 })
)}`;

const ACCESS_DIR = "C:/Users/L/Desktop/stoor/.tmp-joj-images";
const PERFUME_DIR = path.join(ACCESS_DIR, "perfume");

const accessMeta = JSON.parse(fs.readFileSync(path.join(ACCESS_DIR, "meta.json"), "utf8"));
const perfumeMeta = JSON.parse(fs.readFileSync(path.join(PERFUME_DIR, "meta.json"), "utf8"));

const accessByIndex = new Map(accessMeta.map((m) => [m.i, m.file]));
const perfumeByIndex = new Map(perfumeMeta.map((m, i) => [i, m.file]));

const mimeOf = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
};

const uploaded = new Map();

async function upload(file) {
  if (uploaded.has(file)) return uploaded.get(file);
  const bytes = fs.readFileSync(file);
  const res = await fetch(`${base}/api/products/upload?scope=main`, {
    method: "POST",
    headers: { cookie, "content-type": mimeOf(file) },
    body: bytes,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(`upload failed ${res.status}: ${JSON.stringify(json)}`);
  uploaded.set(file, json.data.path);
  console.log("uploaded", path.basename(file), "→", json.data.path);
  return json.data.path;
}

const fileOf = (group, i) => {
  const file = group === "perfume" ? perfumeByIndex.get(i) : accessByIndex.get(i);
  if (!file) throw new Error(`missing image ${group}#${i}`);
  return file;
};

const colors = (...list) => list.map(([name, hex, stock]) => ({ name, hex, stock }));

/**
 * كل عنصر: إما تحديث منتج قائم (patch) أو إنشاء جديد (create).
 * images[0] هي الصورة الرئيسية، وبقية الصور تُوزَّع على الألوان بالترتيب.
 */
const specs = [
  // ── تحديث المنتجات الحالية بصور وألوان ───────────────────────
  { type: "patch", id: "a-402", images: [["accessories", 53]], colors: colors(["ذهبي", "#d4af37", 24], ["فضي", "#c0c0c0", 12]) },
  { type: "patch", id: "a-403", images: [["accessories", 41]], colors: colors(["ذهبي", "#d4af37", 30], ["فضي", "#c0c0c0", 21]) },
  { type: "patch", id: "a-404", images: [["accessories", 12]], colors: colors(["ذهبي", "#d4af37", 25], ["وردي", "#e8b4b8", 15]) },
  { type: "patch", id: "a-405", images: [["accessories", 30]], colors: colors(["ذهبي", "#d4af37", 15], ["فضي", "#c0c0c0", 10]) },
  { type: "patch", id: "a-401", images: [["accessories", 3]], colors: colors(["لؤلؤي", "#f5efe6", 18], ["ذهبي", "#d4af37", 12]) },
  { type: "patch", id: "a-502", images: [["accessories", 22]], colors: colors(["ذهبي", "#d4af37", 30], ["فضي", "#c0c0c0", 17]) },
  { type: "patch", id: "a-503", images: [["accessories", 55]], colors: colors(["ذهبي", "#d4af37", 12], ["فضي", "#c0c0c0", 7]) },

  { type: "patch", id: "p-102", images: [["perfume", 51]] },
  { type: "patch", id: "p-103", images: [["perfume", 52]] },
  { type: "patch", id: "p-104", images: [["perfume", 44]] },
  { type: "patch", id: "p-105", images: [["perfume", 10]] },
  { type: "patch", id: "p-201", images: [["perfume", 14]] },
  { type: "patch", id: "p-202", images: [["perfume", 15]] },
  { type: "patch", id: "p-203", images: [["perfume", 47]] },
  { type: "patch", id: "p-204", images: [["perfume", 11]] },
  { type: "patch", id: "p-205", images: [["perfume", 48]] },
  { type: "patch", id: "p-301", images: [["perfume", 39]] },
  { type: "patch", id: "p-302", images: [["perfume", 30]] },

  // ── أطقم ────────────────────────────────────────────────────
  {
    type: "create",
    images: [["accessories", 0], ["accessories", 1]],
    body: {
      name: "طقم أميرة دقة الألماس",
      subtitle: "سلسلة وأقراط وخاتم مطلي بالذهب",
      category: "accessories-5",
      gender: "women",
      price: 499,
      compareAt: 999,
      artwork: "set",
      tone: "#d4af37",
      stock: 24,
      badge: "best",
      description: "طقم كامل من ثلاث قطع بتصميم فاخر مطلي بالذهب ومرصع بالزركون — سلسلة وأقراط وخاتم في علبة هدايا أنيقة.",
      features: ["مطلي بالذهب", "مرصع بالزركون", "علبة هدايا فاخرة"],
      colors: colors(["ذهبي", "#d4af37", 16], ["فضي", "#c0c0c0", 8]),
    },
  },
  {
    type: "create",
    images: [["accessories", 6], ["accessories", 5]],
    body: {
      name: "طقم الزمرد الملكي",
      subtitle: "طقم فاخر مرصع بالزركون الأخضر",
      category: "accessories-5",
      gender: "women",
      price: 549,
      compareAt: 1099,
      artwork: "set",
      tone: "#1f6f50",
      stock: 18,
      badge: "limited",
      description: "طقم ملكي بتصميم مستوحى من دور المجوهرات العالمية، مرصع بزركون أخضر بلون الزمرد مع تشطيب ذهبي لامع.",
      features: ["زركون بلون الزمرد", "مطلي بالذهب", "تصميم ملكي"],
      colors: colors(["زمردي", "#1f6f50", 10], ["ذهبي", "#d4af37", 8]),
    },
  },
  {
    type: "create",
    images: [["accessories", 5], ["accessories", 4]],
    body: {
      name: "طقم الصدف الفاخر",
      subtitle: "سلسلة وأقراط بصدف طبيعي",
      category: "accessories-5",
      gender: "women",
      price: 380,
      artwork: "set",
      tone: "#efe3d2",
      stock: 20,
      description: "طقم بقطع صدفية ناعمة وتشطيب مطلي بالذهب، يمنح إطلالة هادئة ومناسبة للاستخدام اليومي والمناسبات.",
      features: ["قطع صدفية", "مطلي بالذهب", "خفيف على الأذن"],
      colors: colors(["صدفي", "#efe3d2", 12], ["ذهبي", "#d4af37", 8]),
    },
  },

  // ── سلاسل ──────────────────────────────────────────────────
  {
    type: "create",
    images: [["accessories", 10], ["accessories", 57]],
    body: {
      name: "عقد اللؤلؤ الفاخر",
      subtitle: "عقد قصير بتصميم شانيل الفضي",
      category: "accessories-1",
      gender: "women",
      price: 150,
      artwork: "necklace",
      tone: "#e9e4dc",
      stock: 26,
      badge: "new",
      description: "عقد لؤلؤ بتصميم كلاسيكي مستوحى من شانيل، خفيف على الرقبة ويناسب الإطلالات الناعمة والرسمية.",
      features: ["لؤلؤ صناعي عالي الجودة", "قفل آمن", "طول قابل للتعديل"],
      colors: colors(["لؤلؤي", "#e9e4dc", 16], ["فضي", "#c0c0c0", 10]),
    },
  },
  {
    type: "create",
    images: [["accessories", 53], ["accessories", 54]],
    body: {
      name: "سلسال إطلالة ملكية",
      subtitle: "سلسال طويل مطلي ذهب عيار 18",
      category: "accessories-1",
      gender: "women",
      price: 230,
      artwork: "necklace",
      tone: "#d4af37",
      stock: 22,
      description: "سلسال طويل بطبقات ناعمة وتشطيب مطلي بالذهب عيار 18، يليق بالإطلالات المسائية والفساتين السادة.",
      features: ["مطلي ذهب عيار 18", "طول 60 سم", "لا يسبب تحسساً"],
      colors: colors(["ذهبي", "#d4af37", 14], ["فضي", "#c0c0c0", 8]),
    },
  },

  // ── أقراط ──────────────────────────────────────────────────
  {
    type: "create",
    images: [["accessories", 44], ["accessories", 45]],
    body: {
      name: "أقراط الفراشة بالصدف",
      subtitle: "أقراط متدلية بالزركون والصدف",
      category: "accessories-2",
      gender: "women",
      price: 129,
      artwork: "earrings",
      tone: "#e6d7c3",
      stock: 32,
      badge: "best",
      description: "أقراط على شكل فراشة بقطع صدفية وزركون لامع، خفيفة على الأذن وثابتة طوال اليوم.",
      features: ["زركون لامع", "قطع صدفية", "إبزيم آمن"],
      colors: colors(["صدفي", "#e6d7c3", 20], ["ذهبي", "#d4af37", 12]),
    },
  },
  {
    type: "create",
    images: [["accessories", 39], ["accessories", 38]],
    body: {
      name: "حلق اللؤلؤ الكلاسيكي",
      subtitle: "أقراط لؤلؤ بتشطيب مطلي بالذهب",
      category: "accessories-2",
      gender: "women",
      price: 95,
      artwork: "earrings",
      tone: "#f0e9dd",
      stock: 40,
      description: "أقراط لؤلؤ كلاسيكية بحجم متوسط، مناسبة للعمل والمناسبات، بتشطيب مطلي بالذهب لا يتغير لونه سريعاً.",
      features: ["لؤلؤ بصري لامع", "مطلي بالذهب", "مناسب لكل الإطلالات"],
      colors: colors(["لؤلؤي", "#f0e9dd", 24], ["ذهبي", "#d4af37", 16]),
    },
  },

  // ── أساور ──────────────────────────────────────────────────
  {
    type: "create",
    images: [["accessories", 21], ["accessories", 20]],
    body: {
      name: "سوار سلسلة مرصع",
      subtitle: "سوار بتصميم عصري مرصع بالزركون",
      category: "accessories-3",
      gender: "women",
      price: 175,
      compareAt: 220,
      artwork: "bracelet",
      tone: "#d4af37",
      stock: 28,
      badge: "sale",
      description: "سوار مرن بتصميم سلسلة مرصعة بالزركون، يناسب المعصم الرفيع والمتوسط ويكمل الإطلالات اليومية.",
      features: ["مرصع بالزركون", "مطلي بالذهب", "مقاس مرن"],
      colors: colors(["ذهبي", "#d4af37", 18], ["فضي", "#c0c0c0", 10]),
    },
  },
  {
    type: "create",
    images: [["accessories", 63], ["accessories", 62]],
    body: {
      name: "خلخال لومي الذهبي",
      subtitle: "خلخال ثلاث طبقات مطلي بالذهب",
      category: "accessories-3",
      gender: "women",
      price: 145,
      artwork: "bracelet",
      tone: "#d4af37",
      stock: 24,
      badge: "new",
      description: "خلخال بثلاث طبقات ناعمة وتشطيب مطلي بالذهب، خفيف ولا يعلق بالملابس، مناسب للصيف والمناسبات.",
      features: ["ثلاث طبقات", "مطلي بالذهب", "طول قابل للتعديل"],
      colors: colors(["ذهبي", "#d4af37", 16], ["فضي", "#c0c0c0", 8]),
    },
  },

  // ── خواتم ──────────────────────────────────────────────────
  {
    type: "create",
    images: [["accessories", 32], ["accessories", 31]],
    body: {
      name: "خاتم الفراشة واللؤلؤ",
      subtitle: "خاتم نسائي بتصميم فراشة",
      category: "accessories-4",
      gender: "women",
      price: 110,
      artwork: "ring",
      tone: "#e8dccb",
      stock: 35,
      description: "خاتم بتصميم فراشة مرصعة بالزركون مع لؤلؤة صغيرة، أنيق للاستخدام اليومي ومقاسات متعددة.",
      features: ["زركون ولؤلؤ", "مطلي بالذهب", "مقاسات 16–19"],
      colors: colors(["ذهبي", "#d4af37", 20], ["فضي", "#c0c0c0", 15]),
    },
  },
  {
    type: "create",
    images: [["accessories", 27], ["accessories", 28]],
    body: {
      name: "خاتم ورق الشجر",
      subtitle: "خاتم بتصميم أوراق ناعم",
      category: "accessories-4",
      gender: "women",
      price: 125,
      artwork: "ring",
      tone: "#c9b189",
      stock: 20,
      description: "خاتم بتصميم أوراق الشجر المطلي بالذهب، قطعة هادئة تناسب الإطلالات اليومية وتُلبس مفردة أو مع خاتم آخر.",
      features: ["تصميم أوراق", "مطلي بالذهب", "خفيف ومريح"],
      colors: colors(["ذهبي", "#c9b189", 12], ["فضي", "#c0c0c0", 8]),
    },
  },

  // ── حقائب ──────────────────────────────────────────────────
  {
    type: "create",
    images: [["perfume", 19], ["perfume", 20]],
    body: {
      name: "حقيبة أمجاد",
      subtitle: "حقيبة هدايا فاخرة",
      category: "accessories-9",
      gender: "women",
      price: 260,
      artwork: "bag",
      tone: "#7a4a2b",
      stock: 14,
      description: "حقيبة هدايا بتصميم كلاسيكي وخامة متينة، مناسبة لتقديم العطور والإكسسوارات كهدية.",
      features: ["خامة متينة", "مقبض مريح", "مناسبة للهدايا"],
      colors: colors(["بني", "#7a4a2b", 8], ["أسود", "#222222", 6]),
    },
  },

  // ── عطور جديدة ──────────────────────────────────────────────
  {
    type: "create",
    images: [["perfume", 8]],
    body: {
      name: "سحر الكلمات",
      subtitle: "أو دو بارفان · 100 مل",
      category: "perfumes-2",
      gender: "women",
      price: 420,
      artwork: "perfume",
      tone: "#d8a5a5",
      stock: 16,
      badge: "new",
      description: "عطر شرقي زهري يفتح بالفواكه ثم يستقر على الورد والمسك، ثبات طويل ومناسب للمساء.",
      features: ["ثبات 8 ساعات", "تركيز 20%", "100 مل"],
    },
  },
  {
    type: "create",
    images: [["perfume", 12]],
    body: {
      name: "بصمة بلو",
      subtitle: "أو دو بارفان · 100 مل",
      category: "perfumes-1",
      gender: "men",
      price: 380,
      artwork: "perfume",
      tone: "#2e4a7a",
      stock: 21,
      description: "عطر رجالي منعش بالزعفران والأخشاب، يفتح بحمضيات قوية ثم يهدأ على العنبر والمسك.",
      features: ["ثبات 8–10 ساعات", "مناسب للعمل", "100 مل"],
    },
  },
  {
    type: "create",
    images: [["perfume", 29]],
    body: {
      name: "مضاوي جولد",
      subtitle: "أو دو بارفان · 100 مل",
      category: "perfumes-3",
      gender: "unisex",
      price: 520,
      artwork: "perfume",
      tone: "#b08d3f",
      stock: 12,
      badge: "limited",
      description: "عطر مشترك فاخر بمزيج من العود والعنبر والورد، ثبات قوي وأثر واضح في المكان.",
      features: ["عود وعنبر", "ثبات 10 ساعات", "100 مل"],
    },
  },
];

const json = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  return { status: res.status, json: j };
};

const categorySlugs = new Set(
  (
    await fetch(`${base}/api/products`, { headers: { cookie } }).then((r) => r.json())
  ).data.categories.map((c) => c.slug)
);

console.log("categories", categorySlugs.size);

const results = [];
for (const spec of specs) {
  try {
    const path0 = await upload(fileOf(...spec.images[0]));

    if (spec.type === "patch") {
      const body = { imagePath: path0 };
      if (spec.colors) body.colors = spec.colors;
      const r = await json("PATCH", `/api/products/${spec.id}`, body);
      if (!r.json?.ok) throw new Error(`patch ${spec.id}: ${r.status} ${JSON.stringify(r.json)}`);
      results.push({ type: "patch", id: spec.id, name: r.json.data.product.name, ok: true });
      console.log("PATCH ok", spec.id, r.json.data.product.name);
    } else {
      if (!categorySlugs.has(spec.body.category)) throw new Error(`unknown category ${spec.body.category}`);
      const body = { ...spec.body, imagePath: path0 };
      const r = await json("POST", "/api/products", body);
      if (!r.json?.ok) throw new Error(`create: ${r.status} ${JSON.stringify(r.json)}`);
      results.push({ type: "create", id: r.json.data.product.id, name: r.json.data.product.name, ok: true });
      console.log("CREATE ok", r.json.data.product.slug, r.json.data.product.name);
    }
  } catch (e) {
    results.push({ type: spec.type, id: spec.id || spec.body?.name, ok: false, error: String(e.message || e) });
    console.log("FAIL", spec.id || spec.body?.name, "→", e.message || e);
  }
}

fs.writeFileSync("C:/Users/L/AppData/Local/Temp/opencode/seed-results.json", JSON.stringify(results, null, 2));
console.log("done. ok:", results.filter((r) => r.ok).length, "fail:", results.filter((r) => !r.ok).length);
