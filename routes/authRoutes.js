const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const upload = require("../middleware/upload");

router.post("/register", upload.single("businessDocument"), authController.register);
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOtp);
router.post("/admin-login", authController.adminLogin);

module.exports = router;
