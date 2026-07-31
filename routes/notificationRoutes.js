const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

// Public endpoint to test sending a push to a single device token (no auth)
router.post('/push/test', async (req, res) => {
	try {
		const { token, title, body } = req.body;
		if (!token || !title || !body) return res.status(400).json({ msg: 'token, title and body required' });
		const firebase = require('../services/firebaseService');
		await firebase.sendToDevice(token, { title, body });
		return res.status(200).json({ msg: 'Push sent' });
	} catch (err) {
		console.error(err);
		return res.status(500).json({ msg: 'Push error', err: err.message });
	}
});

// Admin Routes
router.get("/admin/notifications", verifyToken, verifyAdmin, notificationController.getNotifications);
router.get("/admin/alerts", verifyToken, verifyAdmin, notificationController.getAdminAlerts);
router.post("/admin/notification-create", verifyToken, verifyAdmin, notificationController.createNotification);
router.post("/admin/alerts-readall", verifyToken, verifyAdmin, notificationController.markAdminAlertsRead);

// Member Routes
router.get("/member/notifications", verifyToken, notificationController.getMemberNotifications);
router.post("/member/notifications-readall", verifyToken, notificationController.markAllRead);

module.exports = router;
