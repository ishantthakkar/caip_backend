const express = require("express");
const router = express.Router();
const membershipController = require("../controllers/membershipController");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

router.get("/membership-plans", membershipController.getMembershipPlans);
router.post("/purchase-membership", verifyToken, membershipController.purchaseMembership);

// Admin routes
router.get("/admin/all-membership-plans", verifyToken, verifyAdmin, membershipController.getAllMembershipPlans);
router.post("/admin/membership-plans", verifyToken, verifyAdmin, membershipController.createMemberPlan);
router.put("/admin/membership-plans/:id", verifyToken, verifyAdmin, membershipController.updateMemberPlan);
router.delete("/admin/membership-plans/:id", verifyToken, verifyAdmin, membershipController.deleteMemberPlan);
router.get("/admin/reconciliation", verifyToken, verifyAdmin, membershipController.getPaymentReconciliation);

module.exports = router;
