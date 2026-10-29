const pool = require("../../config/db");

async function listActiveClinics() {
    const [rows] = await pool.execute(
        `SELECT
            c.id,
            c.clinic_code AS clinicCode,
            c.clinic_name AS clinicName,
            c.description,
            r.building_name AS buildingName,
            r.floor_label AS floorLabel,
            r.room_number AS roomNumber,
            r.directions_text AS directions
         FROM clinics c
         LEFT JOIN clinic_rooms r
           ON r.id = (
                SELECT cr.id
                FROM clinic_rooms cr
                WHERE cr.clinic_id = c.id AND cr.is_active = 1
                ORDER BY cr.is_primary DESC, cr.id ASC
                LIMIT 1
           )
         WHERE c.is_active = 1
         ORDER BY c.clinic_name ASC`
    );

    return rows.map((row) => ({
        id: String(row.id),
        clinicCode: row.clinicCode,
        clinicName: row.clinicName,
        description: row.description,
        location: row.roomNumber ? {
            buildingName: row.buildingName,
            floorLabel: row.floorLabel,
            roomNumber: row.roomNumber,
            directions: row.directions
        } : null
    }));
}

module.exports = {
    listActiveClinics
};
