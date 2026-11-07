import { Router } from "express";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import {
  deleteReview,
  listReviews,
  updateReview,
} from "../services/reviews.service.js";

const router = Router();

const statusOptions = [
  { value: "", label: "الكل" },
  { value: "pending", label: "بانتظار المراجعة" },
  { value: "approved", label: "معتمدة" },
  { value: "rejected", label: "مرفوضة" },
];

router.get("/reviews", requireAdmin, (req, res) => {
  res.render("reviews", {
    title: "التقييمات",
    active: "reviews",
    pageScript: "reviews",
    statusOptions,
  });
});

router.get(
  "/api/reviews",
  requireAdmin,
  route(async (req, res) => {
    const data = await listReviews({
      status: req.query.status,
      query: req.query.query,
    });
    return ok(res, data);
  })
);

router.patch(
  "/api/reviews/:id",
  requireAdmin,
  route(async (req, res) => {
    const result = await updateReview(req.params.id, req.body ?? {});
    if (!result.ok) return fail(res, result.status, result.error);
    return ok(res, { updated: true });
  })
);

router.delete(
  "/api/reviews/:id",
  requireAdmin,
  route(async (req, res) => {
    const result = await deleteReview(req.params.id);
    if (!result.ok) return fail(res, result.status, result.error);
    return ok(res, { deleted: true });
  })
);

export default router;
