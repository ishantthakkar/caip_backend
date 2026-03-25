const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const verifyToken = require("../middleware/auth");

// Admin Routes
router.get("/admin/notifications", verifyToken, notificationController.getNotifications);
router.get("/admin/alerts", verifyToken, notificationController.getAdminAlerts);
router.post("/admin/notification-create", verifyToken, notificationController.createNotification);
router.post("/admin/alerts-readall", verifyToken, notificationController.markAdminAlertsRead);

// Member Routes
router.get("/member/notifications", verifyToken, notificationController.getMemberNotifications);
router.post("/member/notifications-readall", verifyToken, notificationController.markAllRead);

module.exports = router;
