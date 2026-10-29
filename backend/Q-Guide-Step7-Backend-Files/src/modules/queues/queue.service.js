const pool = require("../../config/db");

const VALID_STATUSES = [
    "WAITING",
    "CALLED",
    "IN_SERVICE",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW"
];

const ALLOWED_TRANSITIONS = {
    WAITING: ["CALLED", "CANCELLED", "NO_SHOW"],
    CALLED: ["WAITING", "IN_SERVICE", "CANCELLED", "NO_SHOW"],
    IN_SERVICE: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: ["WAITING"]
};

function getManilaDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getClinicByCode(connection, clinicCode) {
    const [rows] = await connection.execute(
        `SELECT id, clinic_code, clinic_name, is_active
         FROM clinics
         WHERE clinic_code = ?
         LIMIT 1`,
        [clinicCode]
    );
    return rows[0] || null;
}

async function writeAudit(connection, actorUserId, action, ticketId, details) {
    await connection.execute(
        `INSERT INTO audit_logs
            (actor_user_id, action, entity_type, entity_id, details_json)
         VALUES (?, ?, 'QUEUE_TICKET', ?, ?)`,
        [actorUserId, action, ticketId, JSON.stringify(details)]
    );
}

async function getQueueList({ clinicCode, queueDate, status }) {
    const date = queueDate || getManilaDate();
    if (!validDate(date)) {
        return { kind: "invalid_date" };
    }

    const connection = await pool.getConnection();
    try {
        const clinic = await getClinicByCode(connection, clinicCode);
        if (!clinic) return { kind: "clinic_not_found" };

        let statusFilter = "";
        const params = [clinic.id, date];
        if (status) {
            if (!VALID_STATUSES.includes(status)) return { kind: "invalid_status" };
            statusFilter = " AND qt.status = ?";
            params.push(status);
        }

        const [rows] = await connection.execute(
            `SELECT
                qt.id AS ticketId,
                qt.token_number AS tokenNumber,
                qt.sequence_number AS sequenceNumber,
                qt.queue_date AS queueDate,
                qt.status,
                qt.called_at AS calledAt,
                qt.in_service_at AS inServiceAt,
                qt.completed_at AS completedAt,
                pv.visit_code AS visitCode,
                pv.checked_in_at AS checkedInAt,
                p.patient_code AS patientCode,
                p.full_name AS patientName,
                c.clinic_code AS clinicCode,
                c.clinic_name AS clinicName,
                cr.floor_label AS floorLabel,
                cr.room_number AS roomNumber
             FROM queue_tickets qt
             INNER JOIN patient_visits pv ON pv.id = qt.visit_id
             INNER JOIN patients p ON p.id = pv.patient_id
             INNER JOIN clinics c ON c.id = qt.clinic_id
             LEFT JOIN clinic_rooms cr ON cr.id = pv.clinic_room_id
             WHERE qt.clinic_id = ? AND qt.queue_date = ?${statusFilter}
             ORDER BY qt.sequence_number ASC`,
            params
        );

        const summary = {
            total: rows.length,
            waiting: rows.filter((row) => row.status === "WAITING").length,
            called: rows.filter((row) => row.status === "CALLED").length,
            inService: rows.filter((row) => row.status === "IN_SERVICE").length,
            completed: rows.filter((row) => row.status === "COMPLETED").length,
            cancelled: rows.filter((row) => row.status === "CANCELLED").length,
            noShow: rows.filter((row) => row.status === "NO_SHOW").length
        };

        return {
            kind: "ok",
            clinic: {
                clinicCode: clinic.clinic_code,
                clinicName: clinic.clinic_name,
                isActive: Boolean(Number(clinic.is_active))
            },
            queueDate: date,
            summary,
            tickets: rows.map((row) => ({
                ticketId: String(row.ticketId),
                tokenNumber: row.tokenNumber,
                sequenceNumber: Number(row.sequenceNumber),
                queueDate: row.queueDate,
                status: row.status,
                visitCode: row.visitCode,
                checkedInAt: row.checkedInAt,
                patient: {
                    patientCode: row.patientCode,
                    fullName: row.patientName
                },
                clinic: {
                    clinicCode: row.clinicCode,
                    clinicName: row.clinicName,
                    floorLabel: row.floorLabel,
                    roomNumber: row.roomNumber
                },
                timestamps: {
                    calledAt: row.calledAt,
                    inServiceAt: row.inServiceAt,
                    completedAt: row.completedAt
                }
            }))
        };
    } finally {
        connection.release();
    }
}

async function callNext({ clinicCode, actorUserId }) {
    const queueDate = getManilaDate();
    const connection = await pool.getConnection();
    let lockName = null;
    let lockAcquired = false;
    let transactionStarted = false;

    try {
        const clinic = await getClinicByCode(connection, clinicCode);
        if (!clinic || !Number(clinic.is_active)) return { kind: "clinic_not_found" };

        lockName = `qgcall:${clinic.id}:${queueDate}`;
        const [lockRows] = await connection.execute(
            "SELECT GET_LOCK(?, 5) AS acquired",
            [lockName]
        );
        lockAcquired = Number(lockRows[0]?.acquired) === 1;
        if (!lockAcquired) return { kind: "busy" };

        await connection.beginTransaction();
        transactionStarted = true;

        const [rows] = await connection.execute(
            `SELECT qt.id, qt.token_number, qt.sequence_number, qt.status,
                    qt.queue_date, qt.clinic_id
             FROM queue_tickets qt
             WHERE qt.clinic_id = ?
               AND qt.queue_date = ?
               AND qt.status = 'WAITING'
             ORDER BY qt.sequence_number ASC
             LIMIT 1
             FOR UPDATE`,
            [clinic.id, queueDate]
        );

        if (!rows.length) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "empty" };
        }

        const ticket = rows[0];
        await connection.execute(
            `UPDATE queue_tickets
             SET status = 'CALLED', called_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [ticket.id]
        );

        await connection.execute(
            `INSERT INTO queue_status_history
                (queue_ticket_id, previous_status, new_status, changed_by_user_id, reason)
             VALUES (?, 'WAITING', 'CALLED', ?, 'Called next from staff dashboard')`,
            [ticket.id, actorUserId]
        );

        await writeAudit(connection, actorUserId, "QUEUE_CALL_NEXT", ticket.id, {
            clinicCode: clinic.clinic_code,
            tokenNumber: ticket.token_number,
            previousStatus: "WAITING",
            newStatus: "CALLED",
            queueDate
        });

        await connection.commit();
        transactionStarted = false;

        return {
            kind: "ok",
            ticket: {
                ticketId: String(ticket.id),
                tokenNumber: ticket.token_number,
                sequenceNumber: Number(ticket.sequence_number),
                queueDate,
                status: "CALLED",
                clinicCode: clinic.clinic_code,
                clinicName: clinic.clinic_name
            }
        };
    } catch (error) {
        if (transactionStarted) await connection.rollback().catch(() => {});
        throw error;
    } finally {
        if (lockAcquired && lockName) {
            await connection.execute("SELECT RELEASE_LOCK(?) AS released", [lockName]).catch(() => {});
        }
        connection.release();
    }
}

async function changeTicketStatus({ ticketId, newStatus, actorUserId, reason }) {
    if (!VALID_STATUSES.includes(newStatus)) return { kind: "invalid_status" };

    const connection = await pool.getConnection();
    let transactionStarted = false;

    try {
        await connection.beginTransaction();
        transactionStarted = true;

        const [rows] = await connection.execute(
            `SELECT qt.id, qt.token_number, qt.sequence_number, qt.queue_date,
                    qt.status, qt.clinic_id, c.clinic_code, c.clinic_name
             FROM queue_tickets qt
             INNER JOIN clinics c ON c.id = qt.clinic_id
             WHERE qt.id = ?
             FOR UPDATE`,
            [ticketId]
        );

        if (!rows.length) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "ticket_not_found" };
        }

        const ticket = rows[0];
        const previousStatus = ticket.status;

        if (!ALLOWED_TRANSITIONS[previousStatus].includes(newStatus)) {
            await connection.rollback();
            transactionStarted = false;
            return {
                kind: "invalid_transition",
                currentStatus: previousStatus,
                requestedStatus: newStatus
            };
        }

        await connection.execute(
            `UPDATE queue_tickets
             SET status = ?,
                 called_at = CASE WHEN ? = 'CALLED' THEN COALESCE(called_at, CURRENT_TIMESTAMP) ELSE called_at END,
                 in_service_at = CASE WHEN ? = 'IN_SERVICE' THEN COALESCE(in_service_at, CURRENT_TIMESTAMP) ELSE in_service_at END,
                 completed_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at END
             WHERE id = ?`,
            [newStatus, newStatus, newStatus, newStatus, ticket.id]
        );

        const cleanReason = reason ? reason.trim().slice(0, 255) : null;
        await connection.execute(
            `INSERT INTO queue_status_history
                (queue_ticket_id, previous_status, new_status, changed_by_user_id, reason)
             VALUES (?, ?, ?, ?, ?)`,
            [ticket.id, previousStatus, newStatus, actorUserId, cleanReason]
        );

        await writeAudit(connection, actorUserId, "QUEUE_STATUS_CHANGED", ticket.id, {
            clinicCode: ticket.clinic_code,
            tokenNumber: ticket.token_number,
            previousStatus,
            newStatus,
            reason: cleanReason
        });

        await connection.commit();
        transactionStarted = false;

        return {
            kind: "ok",
            ticket: {
                ticketId: String(ticket.id),
                tokenNumber: ticket.token_number,
                sequenceNumber: Number(ticket.sequence_number),
                queueDate: ticket.queue_date,
                clinicCode: ticket.clinic_code,
                clinicName: ticket.clinic_name,
                previousStatus,
                status: newStatus,
                reason: cleanReason
            }
        };
    } catch (error) {
        if (transactionStarted) await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    VALID_STATUSES,
    getManilaDate,
    validDate,
    getQueueList,
    callNext,
    changeTicketStatus
};
