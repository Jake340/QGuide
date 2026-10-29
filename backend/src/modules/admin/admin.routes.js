const express = require("express");
const authenticateToken = require("../../middleware/authorize.middleware");
const authorizeRoles = require("../../middleware/authorize.middleware");
const adminController = require("./admin-management.controller");

const router = express.Router();

// Kept as a simple role-verification endpoint from Step 5.
router.get(
    "/access-check",
    authenticateToken,
    authorizeRoles("ADMIN"),
    (req, res) => {
        return res.status(200).json({
            status: "ok",
            message: "Administrator access verified.",
            user: req.user
        });
    }
);

// All management endpoints below require an active ADMIN token.
router.use(authenticateToken, authorizeRoles("ADMIN"));

router.get("/clinics", adminController.listClinics);
router.post("/clinics", adminController.createClinic);
router.patch("/clinics/:clinicId", adminController.updateClinic);

router.get("/staff", adminController.listStaff);
router.post("/staff", adminController.createStaff);
router.patch("/staff/:userId", adminController.updateStaff);

router.get("/audit-logs", adminController.listAuditLogs);

module.exports = router;
