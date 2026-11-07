import { Router } from "express";
import { Readable } from "node:stream";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { sbFetchObject } from "../supabase.js";
import {
  applyOrderUpdate,
  getOrder,
  listOrders,
  notifyStoreRevalidate,
} from "../services/orders.service.js";

import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_ORDER,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_ORDER,
  STOCK_STATE_LABEL,
  STOCK_STATE_ORDER,
} from "../../public/assets/js/core/domain.js";

const router = Router();

const statusOptions = ORDER_STATUS_ORDER.map((value) => ({
  value,
  label: ORDER_STATUS_LABEL[value],
}));

const paymentOptions = ["cod", "transfer", "wallet"].map((value) => ({
  value,
  label: PAYMENT_METHOD_LABEL[value],
}));

const paymentStatusOptions = PAYMENT_STATUS_ORDER.map((value) => ({
  value,
  label: PAYMENT_STATUS_LABEL[value],
}));

const stockStateOptions = STOCK_STATE_ORDER.map((value) => ({
  value,
  label: STOCK_STATE_LABEL[value],
}));

router.get("/orders", requireAdmin, (req, res) => {
  res.render("orders", {
    title: "الطلبات",
    active: "orders",
    pageScript: "orders",
    statusOptions,
    paymentOptions,
    paymentStatusOptions,
    stockStateOptions,
  });
});

router.get(
  "/api/orders",
  requireAdmin,
  route(async (req, res) => {
    const orders = await listOrders({
      query: req.query.query,
      status: req.query.status,
      payment: req.query.payment,
      paymentStatus: req.query.paymentStatus,
      stockState: req.query.stockState,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
    });
    return ok(res, { orders });
  })
);

router.get(
  "/api/orders/:id",
  requireAdmin,
  route(async (req, res) => {
    const order = await getOrder(req.params.id);
    if (!order) return fail(res, 404, "الطلب غير موجود");
    return ok(res, { order });
  })
);

router.patch(
  "/api/orders/:id",
  requireAdmin,
  route(async (req, res) => {
    const result = await applyOrderUpdate(req.params.id, req.body ?? {});

    if (!result.ok) return fail(res, result.status, result.error);

    if (result.stockChanged) await notifyStoreRevalidate();

    const order = await getOrder(req.params.id);
    return ok(res, { order, reopened: result.reopened });
  })
);

/** تأكيد الطلب وخصم مخزونه — نقطة صريحة للزر الرئيسي في شاشة الطلبات. */
router.post(
  "/api/orders/:id/confirm",
  requireAdmin,
  route(async (req, res) => {
    const result = await applyOrderUpdate(req.params.id, { status: "confirmed" });

    if (!result.ok) return fail(res, result.status, result.error);

    if (result.stockChanged) await notifyStoreRevalidate();

    const order = await getOrder(req.params.id);
    return ok(res, { order });
  })
);

/**
 * بروكسي الإيصال: الملف في مخزن خاص، فلا نكشف المفتاح للمتصفح.
 * نعيد تدفق الملف كما هو مع منع التخزين المؤقت.
 */
router.get(
  "/api/orders/:id/proof",
  requireAdmin,
  route(async (req, res) => {
    const order = await getOrder(req.params.id);
    if (!order) return fail(res, 404, "الطلب غير موجود");
    if (!order.paymentProofPath) return fail(res, 404, "لا يوجد إيصال لهذا الطلب");

    const upstream = await sbFetchObject("payment-proofs", order.paymentProofPath);

    if (!upstream.ok || !upstream.body) {
      return fail(res, 404, "تعذّر العثور على ملف الإيصال");
    }

    const contentType =
      upstream.headers.get("content-type") ||
      (order.paymentProofPath.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "image/jpeg");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");

    Readable.fromWeb(upstream.body).pipe(res);
  })
);

export default router;
