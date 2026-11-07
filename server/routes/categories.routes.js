import { Router } from "express";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { notifyStoreRevalidate } from "../services/orders.service.js";
import {
  CATEGORY_PARENT_LABEL,
  CATEGORY_PARENT_ORDER,
  GENDER_LABEL,
  GENDER_ORDER,
} from "../../public/assets/js/core/domain.js";
import {
  createCategory,
  deleteCategory,
  listCategoriesWithCounts,
  updateCategory,
} from "../services/categories.service.js";

const router = Router();

const parentOptions = CATEGORY_PARENT_ORDER.map((value) => ({
  value,
  label: CATEGORY_PARENT_LABEL[value],
}));

const genderOptions = GENDER_ORDER.map((value) => ({
  value,
  label: GENDER_LABEL[value],
}));

router.get("/categories", requireAdmin, (req, res) => {
  res.render("categories", {
    title: "التصنيفات",
    active: "categories",
    pageScript: "categories",
    parentOptions,
    genderOptions,
  });
});

router.get(
  "/api/categories",
  requireAdmin,
  route(async (req, res) => {
    return ok(res, await listCategoriesWithCounts());
  })
);

router.post(
  "/api/categories",
  requireAdmin,
  route(async (req, res) => {
    const result = await createCategory(req.body ?? {});
    if (!result.ok) return fail(res, result.status || 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { category: result.category }, 201);
  })
);

router.patch(
  "/api/categories/:slug",
  requireAdmin,
  route(async (req, res) => {
    const result = await updateCategory(req.params.slug, req.body ?? {});
    if (!result.ok) return fail(res, result.status || 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { category: result.category });
  })
);

router.delete(
  "/api/categories/:slug",
  requireAdmin,
  route(async (req, res) => {
    const result = await deleteCategory(req.params.slug);
    if (!result.ok) return fail(res, result.status || 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { deleted: true });
  })
);

export default router;
