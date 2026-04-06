const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const upload = require("../middleware/upload");

router.post("/send-register-otp", authController.sendRegisterOtp);
router.post("/register", upload.fields([{ name: 'businessDocuments', maxCount: 5 }]), authController.register);
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOtp);
router.post("/admin-login", authController.adminLogin);
router.get("/verify-gst/:gst", authController.verifyGst);

module.exports = router;
