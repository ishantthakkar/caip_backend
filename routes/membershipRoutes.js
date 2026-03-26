const express = require("express");
const router = express.Router();
const membershipController = require("../controllers/membershipController");
const verifyToken = require("../middleware/auth");

router.get("/membership-plans", membershipController.getMembershipPlans);
router.post("/purchase-membership", verifyToken, membershipController.purchaseMembership);

// Admin routes
router.get("/admin/all-membership-plans", verifyToken, membershipController.getAllMembershipPlans);
router.post("/admin/membership-plans", verifyToken, membershipController.createMemberPlan);
router.put("/admin/membership-plans/:id", verifyToken, membershipController.updateMemberPlan);
router.delete("/admin/membership-plans/:id", verifyToken, membershipController.deleteMemberPlan);
router.get("/admin/reconciliation", verifyToken, membershipController.getPaymentReconciliation);

module.exports = router;
