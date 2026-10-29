const crypto = require("node:crypto");
const pool = require("../../config/db");

function normalizeName(value) {
    return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function makePatientCode() {
    return `QG-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
}

async function writePatientAudit(connection, action, patientId, details) {
    await connection.execute(
        `INSERT INTO audit_logs
            (actor_user_id, action, entity_type, entity_id, details_json)
         VALUES (NULL, ?, 'PATIENT', ?, ?)`,
        [action, patientId, JSON.stringify(details)]
    );
}

async function registerPatient({ fullName, dateOfBirth, contactNumber }) {
    const cleanName = normalizeName(fullName);
    const identityKey = `${cleanName.toLocaleLowerCase("en-US")}|${dateOfBirth}`;
    // MySQL advisory-lock names are limited to 64 characters.
    const lockName = `qgpatient:${crypto
        .createHash("sha256")
        .update(identityKey)
        .digest("hex")
        .slice(0, 54)}`;

    const connection = await pool.getConnection();
    let transactionStarted = false;
    let lockAcquired = false;

    try {
        const [lockRows] = await connection.execute(
            "SELECT GET_LOCK(?, 5) AS acquired",
            [lockName]
        );

        lockAcquired = Number(lockRows[0]?.acquired) === 1;

        if (!lockAcquired) {
            return { kind: "busy" };
        }

        await connection.beginTransaction();
        transactionStarted = true;

        // Name + DOB identifies a possible duplicate, not definitive proof
        // that two people are the same. Do not merge profiles automatically.
        const [matches] = await connection.execute(
            `SELECT id
             FROM patients
             WHERE full_name = ? AND date_of_birth = ?
             LIMIT 1
             FOR UPDATE`,
            [cleanName, dateOfBirth]
        );

        if (matches.length > 0) {
            await connection.rollback();
            transactionStarted = false;
            return { kind: "duplicate" };
        }

        let patientCode;
        let result;

        // Random codes have ample space; retry a rare patient-code collision.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            patientCode = makePatientCode();
            try {
                [result] = await connection.execute(
                    `INSERT INTO patients
                        (user_id, patient_code, full_name, date_of_birth, contact_number)
                     VALUES (NULL, ?, ?, ?, ?)`,
                    [patientCode, cleanName, dateOfBirth, contactNumber || null]
                );
                break;
            } catch (error) {
                if (error.code !== "ER_DUP_ENTRY" || attempt === 2) {
                    throw error;
                }
            }
        }

        await writePatientAudit(connection, "PATIENT_PROFILE_CREATED", result.insertId, {
            source: "MOBILE_REGISTRATION"
        });

        await connection.commit();
        transactionStarted = false;

        return {
            kind: "created",
            patient: {
                id: String(result.insertId),
                patientCode,
                fullName: cleanName,
                dateOfBirth
            }
        };
    } catch (error) {
        if (transactionStarted) {
            await connection.rollback().catch(() => {});
        }
        throw error;
    } finally {
        if (lockAcquired) {
            await connection
                .execute("SELECT RELEASE_LOCK(?) AS released", [lockName])
                .catch(() => {});
        }
        connection.release();
    }
}

async function lookupPatient({ patientCode, dateOfBirth }) {
    const [rows] = await pool.execute(
        `SELECT id, patient_code, full_name
         FROM patients
         WHERE patient_code = ? AND date_of_birth = ?
         LIMIT 1`,
        [patientCode.trim().toUpperCase(), dateOfBirth]
    );

    if (!rows.length) {
        return null;
    }

    return {
        id: String(rows[0].id),
        patientCode: rows[0].patient_code,
        fullName: rows[0].full_name
    };
}

module.exports = {
    registerPatient,
    lookupPatient
};
