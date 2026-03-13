const express = require("express");
const router = express.Router();
const subMemberController = require("../controllers/subMemberController");

router.post("/create", subMemberController.createSubMember);
router.get("/list/:parentId", subMemberController.getSubMembers);
router.put("/update/:id", subMemberController.updateSubMember);
router.delete("/delete/:id", subMemberController.deleteSubMember);
router.post("/toggle-status/:id", subMemberController.toggleActiveStatus);

module.exports = router;
