import { Router } from "express";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import {
  getPaymentMethods,
  savePaymentMethods,
} from "../services/settings.service.js";
import { notifyStoreRevalidate } from "../services/orders.service.js";

const router = Router();

router.get("/settings", requireAdmin, (req, res) => {
  res.render("settings", {
    title: "الدفع والمحافظ",
    active: "settings",
    pageScript: "settings",
  });
});

router.get(
  "/api/settings/payment-methods",
  requireAdmin,
  route(async (req, res) => ok(res, { methods: await getPaymentMethods() }))
);

router.put(
  "/api/settings/payment-methods",
  requireAdmin,
  route(async (req, res) => {
    const result = await savePaymentMethods(req.body?.methods ?? []);
    if (!result.ok) return fail(res, 400, result.error);

    await notifyStoreRevalidate();
    return ok(res, { methods: result.value });
  })
);

export default router;
