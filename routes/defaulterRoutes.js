const express = require("express");
const router = express.Router();
const defaulterController = require("../controllers/defaulterController");
const { verifyToken, verifyAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/defaulter/check-duplicate", verifyToken, defaulterController.checkDuplicates);
router.post("/defaulter/report", verifyToken, upload.array("attachment_documents", 5), defaulterController.reportDefaulter);
router.get("/defaulter/search", verifyToken, defaulterController.searchDefaulter);
router.get("/defaulter/my-reports", verifyToken, defaulterController.getMyReports);
router.get("/member/dashboard-stats", verifyToken, defaulterController.getDashboardStats);
router.get("/defaulter/search-history", verifyToken, defaulterController.getSearchHistory);
router.put("/defaulter/update/:id", verifyToken, upload.array("attachment_documents", 5), defaulterController.updateReport);
router.post("/defaulter/add-payment/:id", verifyToken, defaulterController.addPayment);
router.post("/defaulter/settle/:id", verifyToken, defaulterController.settleReport);
router.post("/member/approve-sub-report", verifyToken, defaulterController.memberApproveSubReport);
router.get("/member/activity-logs", verifyToken, defaulterController.getActivityLogs);
router.post("/auth/log-logout", verifyToken, defaulterController.logLogout);

// Admin routes for defaulters
router.get("/admin/dashboard-stats", verifyToken, verifyAdmin, defaulterController.getAdminDashboardStats);
router.get("/admin/defaulters", verifyToken, verifyAdmin, defaulterController.adminGetAllDefaulters);
router.get("/admin/member-defaulters/:userId", verifyToken, verifyAdmin, defaulterController.adminGetDefaultersByMember);
router.post("/admin/defaulter/change-status", verifyToken, verifyAdmin, defaulterController.adminChangeStatus);
router.get("/admin/activity-logs", verifyToken, verifyAdmin, defaulterController.adminGetActivityLogs);

module.exports = router;
