const crypto = require("node:crypto");
const pool = require("../../config/db");

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

function makeVisitCode(queueDate) {
    return `VIS-${queueDate.replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function writeCheckinAudit(connection, ticketId, clinicCode, tokenNumber, queueDate) {
    await connection.execute(
        `INSERT INTO audit_logs
            (actor_user_id, action, entity_type, entity_id, details_json)
         VALUES (NULL, 'PATIENT_CHECKIN_CREATED', 'QUEUE_TICKET', ?, ?)`,
        [ticketId, JSON.stringify({ clinicCode, tokenNumber, queueDate, status: "WAITING" })]
    );
}

async function checkInPatient({ patientCode, dateOfBirth, clinicCode, arrivalMethod }) {
    const queueDate = getManilaDate();
    const connection = await pool.getConnection();
    let transactionStarted = false;
    let lockName = null;
    let lockAcquired = false;

    try {
        await connection.beginTransaction();
        transactionStarted = true;

        const [patients] = await connection.execute(
            `SELECT id, patient_code, full_name
             FROM patients
             WHERE patient_code = ? AND date_of_birth = ?
             LIMIT 1`,
            [patientCode.trim().toUpperCase(), dateOfBirth]
        );

        if (!patients.length) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "patient_not_found" };
        }
        const patient = patients[0];

        const [clinics] = await connection.execute(
            `SELECT id, clinic_code, clinic_name, token_prefix
             FROM clinics
             WHERE clinic_code = ? AND is_active = 1
             LIMIT 1`,
            [clinicCode.trim().toUpperCase()]
        );

        if (!clinics.length) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "clinic_not_found" };
        }
        const clinic = clinics[0];

        // Serialize check-ins for the same patient + clinic + local date.
        lockName = `qgc:${patient.id}:${clinic.id}:${queueDate}`;
        const [lockRows] = await connection.execute(
            "SELECT GET_LOCK(?, 5) AS acquired",
            [lockName]
        );
        lockAcquired = Number(lockRows[0]?.acquired) === 1;

        if (!lockAcquired) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "busy" };
        }

        const [existingTickets] = await connection.execute(
            `SELECT qt.token_number AS tokenNumber,
                    qt.status,
                    qt.queue_date AS queueDate,
                    c.clinic_name AS clinicName
             FROM queue_tickets qt
             INNER JOIN patient_visits pv ON pv.id = qt.visit_id
             INNER JOIN clinics c ON c.id = qt.clinic_id
             WHERE pv.patient_id = ?
               AND qt.clinic_id = ?
               AND qt.queue_date = ?
               AND qt.status IN ('WAITING', 'CALLED', 'IN_SERVICE')
             ORDER BY qt.id DESC
             LIMIT 1`,
            [patient.id, clinic.id, queueDate]
        );

        if (existingTickets.length) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "already_queued", ticket: existingTickets[0] };
        }

        const [roomRows] = await connection.execute(
            `SELECT id, building_name AS buildingName, floor_label AS floorLabel,
                    room_number AS roomNumber, directions_text AS directions
             FROM clinic_rooms
             WHERE clinic_id = ? AND is_active = 1
             ORDER BY is_primary DESC, id ASC
             LIMIT 1`,
            [clinic.id]
        );
        const room = roomRows[0] || null;

        // Create or increment this clinic's daily sequence under row lock.
        await connection.execute(
            `INSERT INTO queue_sequences (clinic_id, queue_date, last_number)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
            [clinic.id, queueDate]
        );

        const [sequenceRows] = await connection.execute(
            `SELECT last_number
             FROM queue_sequences
             WHERE clinic_id = ? AND queue_date = ?
             FOR UPDATE`,
            [clinic.id, queueDate]
        );

        const sequenceNumber = Number(sequenceRows[0].last_number);
        const tokenNumber = `${clinic.token_prefix}-${String(sequenceNumber).padStart(3, "0")}`;
        const visitCode = makeVisitCode(queueDate);

        const [visitResult] = await connection.execute(
            `INSERT INTO patient_visits
                (visit_code, patient_id, clinic_id, clinic_room_id,
                 arrival_method, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, NULL)`,
            [visitCode, patient.id, clinic.id, room ? room.id : null, arrivalMethod]
        );

        const [ticketResult] = await connection.execute(
            `INSERT INTO queue_tickets
                (visit_id, clinic_id, queue_date, sequence_number, token_number, status)
             VALUES (?, ?, ?, ?, ?, 'WAITING')`,
            [visitResult.insertId, clinic.id, queueDate, sequenceNumber, tokenNumber]
        );

        await connection.execute(
            `INSERT INTO queue_status_history
                (queue_ticket_id, previous_status, new_status, changed_by_user_id, reason)
             VALUES (?, NULL, 'WAITING', NULL, 'Patient self check-in')`,
            [ticketResult.insertId]
        );

        await writeCheckinAudit(
            connection,
            ticketResult.insertId,
            clinic.clinic_code,
            tokenNumber,
            queueDate
        );

        await connection.commit();
        transactionStarted = false;

        return {
            kind: "created",
            patient: {
                patientCode: patient.patient_code,
                fullName: patient.full_name
            },
            visit: {
                visitCode,
                checkedInDate: queueDate,
                arrivalMethod
            },
            ticket: {
                id: String(ticketResult.insertId),
                tokenNumber,
                sequenceNumber,
                queueDate,
                status: "WAITING"
            },
            clinic: {
                clinicCode: clinic.clinic_code,
                clinicName: clinic.clinic_name,
                location: room ? {
                    buildingName: room.buildingName,
                    floorLabel: room.floorLabel,
                    roomNumber: room.roomNumber,
                    directions: room.directions
                } : null
            }
        };
    } catch (error) {
        if (transactionStarted) {
            await connection.rollback().catch(() => {});
        }
        throw error;
    } finally {
        if (lockAcquired && lockName) {
            await connection
                .execute("SELECT RELEASE_LOCK(?) AS released", [lockName])
                .catch(() => {});
        }
        connection.release();
    }
}

module.exports = {
    checkInPatient
};
