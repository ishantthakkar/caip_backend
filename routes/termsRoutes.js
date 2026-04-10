const express = require("express");
const router = express.Router();
const termsController = require("../controllers/termsController");
const { verifyToken, verifyAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");

// Public Route (Fetch published terms)
router.get("/terms/published", termsController.getPublishedTerms);

// Admin Routes (Manage terms)
router.get("/admin/terms", verifyToken, verifyAdmin, termsController.adminGetTerms);
router.post("/admin/terms", verifyToken, verifyAdmin, upload.single("file"), termsController.adminCreateTerms);
router.put("/admin/terms/:id", verifyToken, verifyAdmin, upload.single("file"), termsController.adminUpdateTerms);
router.delete("/admin/terms/:id", verifyToken, verifyAdmin, termsController.adminDeleteTerms);

module.exports = router;
