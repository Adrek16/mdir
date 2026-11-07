import { Router } from "express";
import { ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { getDashboard } from "../services/dashboard.service.js";

const router = Router();

router.get("/", requireAdmin, (req, res) => {
  res.redirect("/dashboard");
});

router.get("/dashboard", requireAdmin, (req, res) => {
  res.render("dashboard", {
    title: "نظرة عامة",
    active: "dashboard",
    pageScript: "dashboard",
  });
});

router.get(
  "/api/dashboard",
  requireAdmin,
  route(async (req, res) => ok(res, await getDashboard()))
);

export default router;
