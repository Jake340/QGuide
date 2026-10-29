const express = require("express");
const clinicController = require("./clinic.controller");

const router = express.Router();

// Only active clinics are exposed to the patient app.
router.get("/", clinicController.list);

module.exports = router;
