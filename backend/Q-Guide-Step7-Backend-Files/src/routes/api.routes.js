const express = require("express");

const healthRoutes = require("./health.routes");
const authRoutes = require("../modules/auth/auth.routes");
const adminRoutes = require("../modules/admin/admin.routes");
const staffRoutes = require("../modules/staff/staff.routes");
const patientRoutes = require("../modules/patients/patient.routes");
const clinicRoutes = require("../modules/clinics/clinic.routes");
const checkinRoutes = require("../modules/checkin/checkin.routes");
const queueRoutes = require("../modules/queues/queue.routes");
const guidanceRoutes = require("../modules/guidance/guidance.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/staff", staffRoutes);
router.use("/patients", patientRoutes);
router.use("/clinics", clinicRoutes);
router.use("/checkin", checkinRoutes);
router.use("/queues", queueRoutes);
router.use("/guidance", guidanceRoutes);

module.exports = router;
