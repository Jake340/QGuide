const {
    getClinicGuidance,
    getPatientQueueStatus,
    validDate
} = require("./guidance.service");

async function clinic(req, res, next) {
    try {
        const clinicCode = String(req.params.clinicCode || "").trim().toUpperCase();
        if (!/^[A-Z0-9-]{1,20}$/.test(clinicCode)) {
            return res.status(400).json({ status: "error", message: "A valid clinic code is required." });
        }

        const guidance = await getClinicGuidance(clinicCode);
        if (!guidance) {
            return res.status(404).json({ status: "error", message: "Active clinic was not found." });
        }

        return res.status(200).json({ status: "ok", guidance });
    } catch (error) {
        return next(error);
    }
}

async function queueStatus(req, res, next) {
    try {
        const patientCode = typeof req.body?.patientCode === "string"
            ? req.body.patientCode.trim().toUpperCase()
            : "";
        const dateOfBirth = req.body?.dateOfBirth;
        const tokenNumber = typeof req.body?.tokenNumber === "string"
            ? req.body.tokenNumber.trim().toUpperCase()
            : "";
        const queueDate = req.body?.queueDate;

        if (!/^[A-Z0-9-]{3,40}$/.test(patientCode)
            || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth || ""))
            || !/^[A-Z0-9-]{1,30}$/.test(tokenNumber)
            || !validDate(queueDate)) {
            return res.status(400).json({
                status: "error",
                message: "patientCode, valid dateOfBirth, tokenNumber, and queueDate (YYYY-MM-DD) are required."
            });
        }

        const result = await getPatientQueueStatus({
            patientCode,
            dateOfBirth,
            tokenNumber,
            queueDate
        });

        if (result.kind === "invalid_date") {
            return res.status(400).json({ status: "error", message: "queueDate must use YYYY-MM-DD format." });
        }
        if (result.kind === "not_found") {
            return res.status(404).json({
                status: "error",
                message: "Queue ticket could not be verified. Check the provided ticket and patient details."
            });
        }

        return res.status(200).json({ status: "ok", ...result });
    } catch (error) {
        return next(error);
    }
}

module.exports = { clinic, queueStatus };
