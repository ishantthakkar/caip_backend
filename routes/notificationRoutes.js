const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

// Admin Routes
router.get("/admin/notifications", verifyToken, verifyAdmin, notificationController.getNotifications);
router.get("/admin/alerts", verifyToken, verifyAdmin, notificationController.getAdminAlerts);
router.post("/admin/notification-create", verifyToken, verifyAdmin, notificationController.createNotification);
router.post("/admin/alerts-readall", verifyToken, verifyAdmin, notificationController.markAdminAlertsRead);

// Member Routes
router.get("/member/notifications", verifyToken, notificationController.getMemberNotifications);
router.post("/member/notifications-readall", verifyToken, notificationController.markAllRead);

module.exports = router;
