const express = require("express");

const authenticateToken = require("../../middleware/authorize.middleware");
const authorizeRoles = require("../../middleware/authorize.middleware");

const router = express.Router();

router.get(
    "/access-check",
    authenticateToken,
    authorizeRoles("STAFF", "ADMIN"),
    (req, res) => {
        return res.status(200).json({
            status: "ok",
            message: "Staff access verified.",
            user: req.user
        });
    }
);

module.exports = router;