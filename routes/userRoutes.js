const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const verifyToken = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/users", userController.getUsers);
router.post("/user/change-staus", userController.changeStatus);
router.get("/profile", verifyToken, userController.getProfile);
router.post("/update-profile", verifyToken, upload.array("businessDocuments", 5), userController.updateProfile);

module.exports = router;
