const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");

router.get("/locations", locationController.getLocations);
router.get("/districts", locationController.getDistricts);
router.get("/sub-districts", locationController.getSubDistricts);
router.get("/cities", locationController.getCities);

module.exports = router;
