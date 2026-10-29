const express = require("express");
const { rateLimit } = require("express-rate-limit");
const patientController = require("./patient.controller");

const router = express.Router();

const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many registration attempts. Please try again later."
    }
});

const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many patient lookup attempts. Please try again later."
    }
});

router.post("/", registrationLimiter, patientController.register);
router.post("/lookup", lookupLimiter, patientController.lookup);

module.exports = router;
