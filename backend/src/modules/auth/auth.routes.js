const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
    login,
    getCurrentUser
} = require("./auth.controller");

const authenticateToken = require("../../middleware/authorize.middleware");

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many login attempts. Try again later."
    }
});

router.post("/login", loginLimiter, login);

router.get("/me", authenticateToken, getCurrentUser);

module.exports = router;