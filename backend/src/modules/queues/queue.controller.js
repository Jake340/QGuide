const {
    VALID_STATUSES,
    getManilaDate,
    validDate,
    getQueueList,
    callNext,
    changeTicketStatus
} = require("./queue.service");

function cleanClinicCode(value) {
    return typeof value === "string" ? value.trim().toUpperCase() : "";
}

async function list(req, res, next) {
    try {
        const clinicCode = cleanClinicCode(req.query.clinicCode);
        const queueDate = req.query.date || getManilaDate();
        const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;

        if (!/^[A-Z0-9-]{1,20}$/.test(clinicCode)) {
            return res.status(400).json({
                status: "error",
                message: "A valid clinicCode query parameter is required."
            });
        }
        if (!validDate(queueDate)) {
            return res.status(400).json({
                status: "error",
                message: "date must use YYYY-MM-DD format."
            });
        }
        if (queueDate > getManilaDate()) {
            return res.status(400).json({
                status: "error",
                message: "Future queue dates are not allowed."
            });
        }
        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                status: "error",
                message: `status must be one of: ${VALID_STATUSES.join(", ")}.`
            });
        }

        const result = await getQueueList({ clinicCode, queueDate, status });
        if (result.kind === "clinic_not_found") {
            return res.status(404).json({ status: "error", message: "Clinic not found." });
        }
        if (result.kind === "invalid_status") {
            return res.status(400).json({ status: "error", message: "Invalid queue status." });
        }

        return res.status(200).json({ status: "ok", ...result });
    } catch (error) {
        return next(error);
    }
}

async function callNextHandler(req, res, next) {
    try {
        const clinicCode = cleanClinicCode(req.body?.clinicCode);
        if (!/^[A-Z0-9-]{1,20}$/.test(clinicCode)) {
            return res.status(400).json({
                status: "error",
                message: "A valid clinicCode is required."
            });
        }

        const result = await callNext({
            clinicCode,
            actorUserId: req.user.id
        });

        if (result.kind === "clinic_not_found") {
            return res.status(404).json({ status: "error", message: "Clinic not found or inactive." });
        }
        if (result.kind === "busy") {
            return res.status(503).json({ status: "error", message: "Queue is busy. Retry shortly." });
        }
        if (result.kind === "empty") {
            return res.status(404).json({
                status: "error",
                code: "NO_WAITING_PATIENTS",
                message: "There are no waiting tickets for this clinic today."
            });
        }

        return res.status(200).json({
            status: "ok",
            message: "The next waiting ticket has been called.",
            ticket: result.ticket
        });
    } catch (error) {
        return next(error);
    }
}

async function updateStatus(req, res, next) {
    try {
        const ticketId = String(req.params.ticketId || "");
        const newStatus = typeof req.body?.status === "string"
            ? req.body.status.trim().toUpperCase()
            : "";
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : null;

        if (!/^\d{1,20}$/.test(ticketId)) {
            return res.status(400).json({ status: "error", message: "ticketId must be a numeric ID." });
        }
        if (!VALID_STATUSES.includes(newStatus)) {
            return res.status(400).json({
                status: "error",
                message: `status must be one of: ${VALID_STATUSES.join(", ")}.`
            });
        }
        if (reason && reason.length > 255) {
            return res.status(400).json({ status: "error", message: "reason must be 255 characters or fewer." });
        }

        const result = await changeTicketStatus({
            ticketId,
            newStatus,
            actorUserId: req.user.id,
            reason
        });

        if (result.kind === "ticket_not_found") {
            return res.status(404).json({ status: "error", message: "Queue ticket not found." });
        }
        if (result.kind === "invalid_status") {
            return res.status(400).json({ status: "error", message: "Invalid queue status." });
        }
        if (result.kind === "invalid_transition") {
            return res.status(409).json({
                status: "error",
                code: "INVALID_STATUS_TRANSITION",
                message: `Cannot change ticket from ${result.currentStatus} to ${result.requestedStatus}.`,
                currentStatus: result.currentStatus,
                requestedStatus: result.requestedStatus
            });
        }

        return res.status(200).json({
            status: "ok",
            message: "Queue status updated.",
            ticket: result.ticket
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    list,
    callNext: callNextHandler,
    updateStatus
};
