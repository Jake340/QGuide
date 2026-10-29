const pool = require("../../config/db");

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getClinicGuidance(clinicCode) {
    const [rows] = await pool.execute(
        `SELECT c.clinic_code AS clinicCode,
                c.clinic_name AS clinicName,
                cr.building_name AS buildingName,
                cr.floor_label AS floorLabel,
                cr.room_number AS roomNumber,
                cr.directions_text AS directions
         FROM clinics c
         LEFT JOIN clinic_rooms cr ON cr.id = (
             SELECT room.id
             FROM clinic_rooms room
             WHERE room.clinic_id = c.id AND room.is_active = 1
             ORDER BY room.is_primary DESC, room.id ASC
             LIMIT 1
         )
         WHERE c.clinic_code = ? AND c.is_active = 1
         LIMIT 1`,
        [clinicCode]
    );

    if (!rows.length) return null;
    const row = rows[0];
    const location = row.roomNumber ? {
        buildingName: row.buildingName,
        floorLabel: row.floorLabel,
        roomNumber: row.roomNumber,
        directions: row.directions
    } : null;

    let message = `${row.clinicName} is selected.`;
    if (location) {
        message = `${row.clinicName} is located on ${location.floorLabel}, Room ${location.roomNumber}.`;
        if (location.buildingName) message += ` Building: ${location.buildingName}.`;
        if (location.directions) message += ` ${location.directions}`;
    } else {
        message += " The room location has not been configured; please ask authorized hospital staff for directions.";
    }

    return {
        clinicCode: row.clinicCode,
        clinicName: row.clinicName,
        location,
        message
    };
}

async function getPatientQueueStatus({ patientCode, dateOfBirth, tokenNumber, queueDate }) {
    if (!validDate(queueDate)) return { kind: "invalid_date" };

    const [rows] = await pool.execute(
        `SELECT qt.id AS ticketId,
                qt.token_number AS tokenNumber,
                qt.sequence_number AS sequenceNumber,
                qt.queue_date AS queueDate,
                qt.status,
                c.clinic_code AS clinicCode,
                c.clinic_name AS clinicName,
                p.full_name AS patientName,
                cr.building_name AS buildingName,
                cr.floor_label AS floorLabel,
                cr.room_number AS roomNumber,
                cr.directions_text AS directions
         FROM queue_tickets qt
         INNER JOIN patient_visits pv ON pv.id = qt.visit_id
         INNER JOIN patients p ON p.id = pv.patient_id
         INNER JOIN clinics c ON c.id = qt.clinic_id
         LEFT JOIN clinic_rooms cr ON cr.id = pv.clinic_room_id
         WHERE p.patient_code = ?
           AND p.date_of_birth = ?
           AND qt.token_number = ?
           AND qt.queue_date = ?
         LIMIT 1`,
        [patientCode, dateOfBirth, tokenNumber, queueDate]
    );

    if (!rows.length) return { kind: "not_found" };
    const row = rows[0];
    let position = null;

    if (row.status === "WAITING") {
        const [positionRows] = await pool.execute(
            `SELECT COUNT(*) AS peopleAhead
             FROM queue_tickets
             WHERE clinic_id = (SELECT id FROM clinics WHERE clinic_code = ? LIMIT 1)
               AND queue_date = ?
               AND status = 'WAITING'
               AND sequence_number < ?`,
            [row.clinicCode, row.queueDate, row.sequenceNumber]
        );
        position = Number(positionRows[0]?.peopleAhead || 0) + 1;
    }

    const location = row.roomNumber ? {
        buildingName: row.buildingName,
        floorLabel: row.floorLabel,
        roomNumber: row.roomNumber,
        directions: row.directions
    } : null;

    return {
        kind: "ok",
        ticket: {
            ticketId: String(row.ticketId),
            tokenNumber: row.tokenNumber,
            queueDate: row.queueDate,
            status: row.status,
            position
        },
        clinic: {
            clinicCode: row.clinicCode,
            clinicName: row.clinicName,
            location
        },
        guidance: location
            ? `${row.clinicName} is located on ${location.floorLabel}, Room ${location.roomNumber}.${location.directions ? ` ${location.directions}` : ""}`
            : `${row.clinicName} location is not configured. Please ask authorized hospital staff for directions.`
    };
}

module.exports = {
    getClinicGuidance,
    getPatientQueueStatus,
    validDate
};
