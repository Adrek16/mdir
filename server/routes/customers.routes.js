import { Router } from "express";
import { fail, ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import {
  getCustomer,
  listCustomers,
  saveCustomerNote,
} from "../services/customers.service.js";

const router = Router();

router.get("/customers", requireAdmin, (req, res) => {
  res.render("customers", {
    title: "العملاء",
    active: "customers",
    pageScript: "customers",
  });
});

router.get(
  "/customers/:id",
  requireAdmin,
  route(async (req, res) => {
    const data = await getCustomer(req.params.id);
    if (!data) {
      return res.status(404).render("error", {
        title: "العميل غير موجود",
        status: 404,
        message: "لا يوجد حساب عميل بهذا المعرّف.",
      });
    }

    return res.render("customer", {
      title: data.customer.name || "ملف العميل",
      active: "customers",
      pageScript: "customer",
      customer: data.customer,
      stats: data.stats,
    });
  })
);

router.get(
  "/api/customers",
  requireAdmin,
  route(async (req, res) => {
    const data = await listCustomers({
      query: req.query.query,
      hasOrders: req.query.hasOrders,
      repeat: req.query.repeat,
      from: req.query.from,
      to: req.query.to,
    });
    return ok(res, data);
  })
);

router.get(
  "/api/customers/:id",
  requireAdmin,
  route(async (req, res) => {
    const data = await getCustomer(req.params.id);
    if (!data) return fail(res, 404, "العميل غير موجود");
    return ok(res, data);
  })
);

router.patch(
  "/api/customers/:id",
  requireAdmin,
  route(async (req, res) => {
    const note = await saveCustomerNote(req.params.id, req.body?.adminNote);
    if (note === null) return fail(res, 404, "العميل غير موجود");
    return ok(res, { adminNote: note });
  })
);

export default router;
