import { Router } from "express";
import { ok, route } from "../http.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { getReports } from "../services/reports.service.js";

const router = Router();

const periodOptions = [
  { value: "today", label: "اليوم" },
  { value: "7d", label: "آخر ٧ أيام" },
  { value: "30d", label: "آخر ٣٠ يوماً" },
  { value: "month", label: "هذا الشهر" },
  { value: "last_month", label: "الشهر الماضي" },
  { value: "custom", label: "نطاق مخصص" },
];

router.get("/reports", requireAdmin, (req, res) => {
  res.render("reports", {
    title: "التقارير",
    active: "reports",
    pageScript: "reports",
    periodOptions,
  });
});

router.get(
  "/api/reports",
  requireAdmin,
  route(async (req, res) =>
    ok(
      res,
      await getReports({
        period: req.query.period,
        from: req.query.from,
        to: req.query.to,
      })
    )
  )
);

export default router;
