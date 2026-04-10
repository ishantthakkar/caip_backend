const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, verifyAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/users", verifyToken, verifyAdmin, userController.getUsers);
router.post("/user/change-staus", verifyToken, verifyAdmin, userController.changeStatus);
router.get("/profile", verifyToken, userController.getProfile);
router.post("/update-profile", verifyToken, upload.fields([
    { name: "businessDocuments", maxCount: 10 },
    { name: "profileImage", maxCount: 1 }
]), userController.updateProfile);

module.exports = router;
