const express = require("express");
const { rateLimit } = require("express-rate-limit");
const guidanceController = require("./guidance.controller");

const router = express.Router();

const queueStatusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many queue-status requests. Try again later."
    }
});

router.get("/clinics/:clinicCode", guidanceController.clinic);
router.post("/queue-status", queueStatusLimiter, guidanceController.queueStatus);

module.exports = router;
