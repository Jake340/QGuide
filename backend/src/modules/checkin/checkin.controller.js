const { checkInPatient } = require("./checkin.service");

function isValidDateOfBirth(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime())
        && date.toISOString().slice(0, 10) === value
        && value <= new Date().toISOString().slice(0, 10);
}

async function create(req, res, next) {
    try {
        const patientCode = typeof req.body?.patientCode === "string"
            ? req.body.patientCode.trim().toUpperCase()
            : "";
        const dateOfBirth = req.body?.dateOfBirth;
        const clinicCode = typeof req.body?.clinicCode === "string"
            ? req.body.clinicCode.trim().toUpperCase()
            : "";
        const arrivalMethod = req.body?.arrivalMethod || "MANUAL";

        if (!/^[A-Z0-9-]{3,40}$/.test(patientCode)) {
            return res.status(400).json({
                status: "error",
                message: "A valid patientCode is required."
            });
        }

        if (!isValidDateOfBirth(dateOfBirth)) {
            return res.status(400).json({
                status: "error",
                message: "dateOfBirth must be a valid date in YYYY-MM-DD format and cannot be in the future."
            });
        }

        if (!/^[A-Z0-9-]{1,20}$/.test(clinicCode)) {
            return res.status(400).json({
                status: "error",
                message: "A valid clinicCode is required."
            });
        }

        if (! ["MANUAL", "GEOFENCE_PROMPT"].includes(arrivalMethod)) {
            return res.status(400).json({
                status: "error",
                message: "arrivalMethod must be MANUAL or GEOFENCE_PROMPT."
            });
        }

        const result = await checkInPatient({
            patientCode,
            dateOfBirth,
            clinicCode,
            arrivalMethod
        });

        if (result.kind === "patient_not_found") {
            return res.status(404).json({
                status: "error",
                message: "Patient could not be verified. Check the patient code and date of birth."
            });
        }

        if (result.kind === "clinic_not_found") {
            return res.status(404).json({
                status: "error",
                message: "The selected clinic was not found or is inactive. Refresh the clinic list and try again."
            });
        }

        if (result.kind === "busy") {
            return res.status(503).json({
                status: "error",
                message: "Check-in is busy. Please retry shortly."
            });
        }

        if (result.kind === "already_queued") {
            return res.status(409).json({
                status: "error",
                code: "ACTIVE_QUEUE_EXISTS",
                message: "You already have an active queue ticket for this clinic today.",
                ticket: result.ticket
            });
        }

        return res.status(201).json({
            status: "ok",
            message: "Check-in completed. Keep your queue ticket and follow the clinic directions.",
            ...result
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = { create };
