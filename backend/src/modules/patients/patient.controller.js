const {
    registerPatient,
    lookupPatient
} = require("./patient.service");

function isValidDateOfBirth(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    return value <= today;
}

function validName(value) {
    return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 150;
}

function validContactNumber(value) {
    if (value === undefined || value === null || value === "") return true;
    return typeof value === "string" && value.trim().length <= 30 && /^[0-9+()\-\s]{7,30}$/.test(value.trim());
}

async function register(req, res, next) {
    try {
        const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
        const dateOfBirth = req.body?.dateOfBirth;
        const contactNumber = typeof req.body?.contactNumber === "string"
            ? req.body.contactNumber.trim()
            : req.body?.contactNumber;

        if (!validName(fullName)) {
            return res.status(400).json({
                status: "error",
                message: "fullName is required and must be 2-150 characters."
            });
        }

        if (!isValidDateOfBirth(dateOfBirth)) {
            return res.status(400).json({
                status: "error",
                message: "dateOfBirth must be a valid date in YYYY-MM-DD format and cannot be in the future."
            });
        }

        if (!validContactNumber(contactNumber)) {
            return res.status(400).json({
                status: "error",
                message: "contactNumber must contain a valid phone-number format or be omitted."
            });
        }

        const result = await registerPatient({
            fullName,
            dateOfBirth,
            contactNumber: contactNumber || null
        });

        if (result.kind === "duplicate") {
            return res.status(409).json({
                status: "error",
                code: "POSSIBLE_DUPLICATE_PATIENT",
                message: "A profile with the same name and date of birth may already exist. Use existing-patient lookup or ask authorized staff to verify before creating another profile."
            });
        }

        if (result.kind === "busy") {
            return res.status(503).json({
                status: "error",
                message: "Patient registration is busy. Please retry shortly."
            });
        }

        return res.status(201).json({
            status: "ok",
            message: "Patient profile created. Keep the patient code private; it is needed for lookup and check-in.",
            patient: result.patient
        });
    } catch (error) {
        return next(error);
    }
}

async function lookup(req, res, next) {
    try {
        const patientCode = typeof req.body?.patientCode === "string"
            ? req.body.patientCode.trim().toUpperCase()
            : "";
        const dateOfBirth = req.body?.dateOfBirth;

        if (!/^[A-Z0-9-]{3,40}$/.test(patientCode) || !isValidDateOfBirth(dateOfBirth)) {
            return res.status(400).json({
                status: "error",
                message: "A valid patientCode and dateOfBirth (YYYY-MM-DD) are required."
            });
        }

        const patient = await lookupPatient({ patientCode, dateOfBirth });

        if (!patient) {
            return res.status(404).json({
                status: "error",
                message: "Patient could not be verified. Check the patient code and date of birth."
            });
        }

        return res.status(200).json({
            status: "ok",
            patient
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    register,
    lookup
};
