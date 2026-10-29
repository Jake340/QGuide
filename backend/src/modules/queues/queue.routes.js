const express = require("express");
const authenticateToken = require("../../middleware/authorize.middleware");
const authorizeRoles = require("../../middleware/authorize.middleware");
const queueController = require("./queue.controller");

const router = express.Router();
const staffAccess = [authenticateToken, authorizeRoles("STAFF", "ADMIN")];

// Specific route must be registered before /:ticketId routes.
router.post("/call-next", ...staffAccess, queueController.callNext);
router.get("/", ...staffAccess, queueController.list);
router.patch("/:ticketId/status", ...staffAccess, queueController.updateStatus);

module.exports = router;
