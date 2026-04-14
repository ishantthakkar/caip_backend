const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");

router.get("/locations", locationController.getLocations);
router.get("/districts", locationController.getDistricts);
router.get("/sub-districts", locationController.getSubDistricts);
router.get("/cities", locationController.getCities);
router.get("/all-locations", locationController.getAllLocations);

module.exports = router;
