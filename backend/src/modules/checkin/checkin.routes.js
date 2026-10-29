const express = require("express");
const { rateLimit } = require("express-rate-limit");
const checkinController = require("./checkin.controller");

const router = express.Router();

const checkinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many check-in attempts. Please try again later."
    }
});

router.post("/", checkinLimiter, checkinController.create);

module.exports = router;
