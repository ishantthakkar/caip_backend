const express = require("express");
const router = express.Router();
const membershipController = require("../controllers/membershipController");
const verifyToken = require("../middleware/auth");

router.get("/membership-plans", membershipController.getMembershipPlans);
router.post("/purchase-membership", verifyToken, membershipController.purchaseMembership);

module.exports = router;
