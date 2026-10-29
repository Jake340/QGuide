const bcrypt = require("bcryptjs");
const pool = require("../../config/db");

function validId(value) {
    return /^\d{1,20}$/.test(String(value || ""));
}

function parseActive(value) {
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
    return null;
}

async function writeAudit(connection, actorUserId, action, entityType, entityId, details) {
    await connection.execute(
        `INSERT INTO audit_logs
            (actor_user_id, action, entity_type, entity_id, details_json)
         VALUES (?, ?, ?, ?, ?)`,
        [actorUserId, action, entityType, entityId, JSON.stringify(details || {})]
    );
}

function sendDbConflict(res, error, fallbackMessage) {
    if (error && error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
            status: "error",
            message: "A clinic code, token prefix, username, or email is already in use."
        });
    }
    console.error(fallbackMessage, error.code || error.message);
    return res.status(500).json({ status: "error", message: fallbackMessage });
}

async function listClinics(req, res, next) {
    try {
        const [rows] = await pool.execute(
            `SELECT
                c.id,
                c.clinic_code AS clinicCode,
                c.clinic_name AS clinicName,
                c.token_prefix AS tokenPrefix,
                c.description,
                c.is_active AS isActive,
                c.created_at AS createdAt,
                c.updated_at AS updatedAt,
                r.building_name AS buildingName,
                r.floor_label AS floorLabel,
                r.room_number AS roomNumber,
                r.directions_text AS directions
             FROM clinics c
             LEFT JOIN clinic_rooms r ON r.id = (
                SELECT cr.id
                FROM clinic_rooms cr
                WHERE cr.clinic_id = c.id
                ORDER BY cr.is_primary DESC, cr.id ASC
                LIMIT 1
             )
             ORDER BY c.clinic_name ASC`
        );

        return res.status(200).json({
            status: "ok",
            clinics: rows.map((row) => ({
                id: String(row.id),
                clinicCode: row.clinicCode,
                clinicName: row.clinicName,
                tokenPrefix: row.tokenPrefix,
                description: row.description,
                isActive: Boolean(Number(row.isActive)),
                location: row.roomNumber || row.floorLabel ? {
                    buildingName: row.buildingName,
                    floorLabel: row.floorLabel,
                    roomNumber: row.roomNumber,
                    directions: row.directions
                } : null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
            }))
        });
    } catch (error) {
        return next(error);
    }
}

async function createClinic(req, res, next) {
    const clinicCode = typeof req.body?.clinicCode === "string"
        ? req.body.clinicCode.trim().toUpperCase() : "";
    const clinicName = typeof req.body?.clinicName === "string"
        ? req.body.clinicName.trim() : "";
    const tokenPrefix = typeof req.body?.tokenPrefix === "string"
        ? req.body.tokenPrefix.trim().toUpperCase() : "";
    const description = typeof req.body?.description === "string"
        ? req.body.description.trim() || null : null;
    const floorLabel = typeof req.body?.floorLabel === "string"
        ? req.body.floorLabel.trim() : "";
    const roomNumber = typeof req.body?.roomNumber === "string"
        ? req.body.roomNumber.trim() : "";
    const buildingName = typeof req.body?.buildingName === "string"
        ? req.body.buildingName.trim() || null : null;
    const directions = typeof req.body?.directions === "string"
        ? req.body.directions.trim() || null : null;

    if (!/^[A-Z0-9-]{2,20}$/.test(clinicCode)) {
        return res.status(400).json({ status: "error", message: "clinicCode must contain 2-20 letters, numbers, or hyphens." });
    }
    if (!clinicName || clinicName.length > 150) {
        return res.status(400).json({ status: "error", message: "clinicName is required and must be at most 150 characters." });
    }
    if (!/^[A-Z0-9]{1,8}$/.test(tokenPrefix)) {
        return res.status(400).json({ status: "error", message: "tokenPrefix must contain 1-8 letters or numbers." });
    }
    if (description && description.length > 500) {
        return res.status(400).json({ status: "error", message: "description must be at most 500 characters." });
    }
    if (Boolean(floorLabel) !== Boolean(roomNumber)) {
        return res.status(400).json({ status: "error", message: "Provide both floorLabel and roomNumber, or leave both blank." });
    }
    if (floorLabel.length > 50 || roomNumber.length > 30 || (buildingName && buildingName.length > 100) || (directions && directions.length > 500)) {
        return res.status(400).json({ status: "error", message: "One or more room location fields exceed their allowed length." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [insert] = await connection.execute(
            `INSERT INTO clinics (clinic_code, clinic_name, token_prefix, description, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [clinicCode, clinicName, tokenPrefix, description]
        );
        const clinicId = insert.insertId;

        if (floorLabel && roomNumber) {
            await connection.execute(
                `INSERT INTO clinic_rooms
                    (clinic_id, building_name, floor_label, room_number, directions_text, is_primary, is_active)
                 VALUES (?, ?, ?, ?, ?, 1, 1)`,
                [clinicId, buildingName, floorLabel, roomNumber, directions]
            );
        }

        await writeAudit(connection, req.user.id, "CLINIC_CREATED", "CLINIC", clinicId, {
            clinicCode,
            clinicName,
            tokenPrefix,
            locationProvided: Boolean(floorLabel && roomNumber)
        });
        await connection.commit();

        return res.status(201).json({
            status: "ok",
            message: "Clinic created.",
            clinic: {
                id: String(clinicId),
                clinicCode,
                clinicName,
                tokenPrefix,
                description,
                isActive: true,
                location: floorLabel && roomNumber ? { buildingName, floorLabel, roomNumber, directions } : null
            }
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error.code === "ER_DUP_ENTRY") return sendDbConflict(res, error, "Could not create clinic.");
        return next(error);
    } finally {
        connection.release();
    }
}

async function updateClinic(req, res, next) {
    const clinicId = String(req.params.clinicId || "");
    if (!validId(clinicId)) {
        return res.status(400).json({ status: "error", message: "clinicId must be a numeric ID." });
    }

    const body = req.body || {};
    const updates = [];
    const params = [];
    const auditChanges = {};

    if (Object.prototype.hasOwnProperty.call(body, "clinicName")) {
        if (typeof body.clinicName !== "string" || !body.clinicName.trim() || body.clinicName.trim().length > 150) {
            return res.status(400).json({ status: "error", message: "clinicName must be 1-150 characters." });
        }
        updates.push("clinic_name = ?");
        params.push(body.clinicName.trim());
        auditChanges.clinicName = body.clinicName.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, "tokenPrefix")) {
        const prefix = typeof body.tokenPrefix === "string" ? body.tokenPrefix.trim().toUpperCase() : "";
        if (!/^[A-Z0-9]{1,8}$/.test(prefix)) {
            return res.status(400).json({ status: "error", message: "tokenPrefix must contain 1-8 letters or numbers." });
        }
        updates.push("token_prefix = ?");
        params.push(prefix);
        auditChanges.tokenPrefix = prefix;
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
        const description = typeof body.description === "string" ? body.description.trim() || null : null;
        if (description && description.length > 500) {
            return res.status(400).json({ status: "error", message: "description must be at most 500 characters." });
        }
        updates.push("description = ?");
        params.push(description);
        auditChanges.descriptionUpdated = true;
    }
    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
        const isActive = parseActive(body.isActive);
        if (isActive === null) {
            return res.status(400).json({ status: "error", message: "isActive must be true or false." });
        }
        updates.push("is_active = ?");
        params.push(isActive ? 1 : 0);
        auditChanges.isActive = isActive;
    }

    const locationKeys = ["buildingName", "floorLabel", "roomNumber", "directions"];
    const locationProvided = locationKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (!updates.length && !locationProvided) {
        return res.status(400).json({ status: "error", message: "Provide at least one clinic or location field to update." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [clinicRows] = await connection.execute(
            "SELECT id, clinic_code FROM clinics WHERE id = ? FOR UPDATE",
            [clinicId]
        );
        if (!clinicRows.length) {
            await connection.rollback();
            return res.status(404).json({ status: "error", message: "Clinic not found." });
        }

        if (updates.length) {
            params.push(clinicId);
            await connection.execute(
                `UPDATE clinics SET ${updates.join(", ")} WHERE id = ?`,
                params
            );
        }

        if (locationProvided) {
            const [roomRows] = await connection.execute(
                `SELECT id, building_name AS buildingName, floor_label AS floorLabel,
                        room_number AS roomNumber, directions_text AS directions
                 FROM clinic_rooms WHERE clinic_id = ?
                 ORDER BY is_primary DESC, id ASC LIMIT 1 FOR UPDATE`,
                [clinicId]
            );
            const current = roomRows[0] || null;
            const floorLabel = Object.prototype.hasOwnProperty.call(body, "floorLabel")
                ? (typeof body.floorLabel === "string" ? body.floorLabel.trim() : "")
                : (current?.floorLabel || "");
            const roomNumber = Object.prototype.hasOwnProperty.call(body, "roomNumber")
                ? (typeof body.roomNumber === "string" ? body.roomNumber.trim() : "")
                : (current?.roomNumber || "");
            const buildingName = Object.prototype.hasOwnProperty.call(body, "buildingName")
                ? (typeof body.buildingName === "string" ? body.buildingName.trim() || null : null)
                : (current?.buildingName || null);
            const directions = Object.prototype.hasOwnProperty.call(body, "directions")
                ? (typeof body.directions === "string" ? body.directions.trim() || null : null)
                : (current?.directions || null);

            if (Boolean(floorLabel) !== Boolean(roomNumber)) {
                await connection.rollback();
                return res.status(400).json({ status: "error", message: "Provide both floorLabel and roomNumber, or leave both blank." });
            }

            if (!floorLabel && !roomNumber) {
                // Blank room fields mean the location is not configured. Preserve historical
                // visit references by deactivating a room rather than deleting it.
                if (current) {
                    await connection.execute(
                        "UPDATE clinic_rooms SET is_active = 0 WHERE id = ?",
                        [current.id]
                    );
                }
                auditChanges.locationDisabled = true;
            } else {
                if (floorLabel.length > 50 || roomNumber.length > 30 || (buildingName && buildingName.length > 100) || (directions && directions.length > 500)) {
                    await connection.rollback();
                    return res.status(400).json({ status: "error", message: "Room location fields exceed their allowed length." });
                }

                if (current) {
                    await connection.execute(
                        `UPDATE clinic_rooms
                         SET building_name = ?, floor_label = ?, room_number = ?, directions_text = ?, is_active = 1
                         WHERE id = ?`,
                        [buildingName, floorLabel, roomNumber, directions, current.id]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO clinic_rooms
                            (clinic_id, building_name, floor_label, room_number, directions_text, is_primary, is_active)
                         VALUES (?, ?, ?, ?, ?, 1, 1)`,
                        [clinicId, buildingName, floorLabel, roomNumber, directions]
                    );
                }
                auditChanges.locationUpdated = true;
            }
        }

        await writeAudit(connection, req.user.id, "CLINIC_UPDATED", "CLINIC", clinicId, auditChanges);
        await connection.commit();
        return res.status(200).json({
            status: "ok",
            message: "Clinic updated. Refresh the clinic list to see the saved values."
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error.code === "ER_DUP_ENTRY") return sendDbConflict(res, error, "Could not update clinic.");
        return next(error);
    } finally {
        connection.release();
    }
}

async function listStaff(req, res, next) {
    try {
        const [rows] = await pool.execute(
            `SELECT id, full_name AS fullName, email, username, role,
                    is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt
             FROM users
             WHERE role IN ('STAFF', 'ADMIN')
             ORDER BY created_at DESC, id DESC`
        );
        return res.status(200).json({
            status: "ok",
            staff: rows.map((row) => ({
                id: String(row.id),
                fullName: row.fullName,
                email: row.email,
                username: row.username,
                role: row.role,
                isActive: Boolean(Number(row.isActive)),
                createdAt: row.createdAt,
                lastLoginAt: row.lastLoginAt
            }))
        });
    } catch (error) {
        return next(error);
    }
}

async function createStaff(req, res, next) {
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const role = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "STAFF";

    if (!fullName || fullName.length > 150) {
        return res.status(400).json({ status: "error", message: "fullName is required and must be at most 150 characters." });
    }
    if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
        return res.status(400).json({ status: "error", message: "username must be 3-80 characters using letters, numbers, dots, underscores, or hyphens." });
    }
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190)) {
        return res.status(400).json({ status: "error", message: "Enter a valid email address or leave it blank." });
    }
    if (!password || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ status: "error", message: "Password must be at least 12 characters and at most 72 UTF-8 bytes for bcrypt." });
    }
    if (!["STAFF", "ADMIN"].includes(role)) {
        return res.status(400).json({ status: "error", message: "role must be STAFF or ADMIN." });
    }

    let passwordHash;
    try {
        passwordHash = await bcrypt.hash(password, 12);
    } catch (error) {
        return next(error);
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [insert] = await connection.execute(
            `INSERT INTO users (full_name, email, username, password_hash, role, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [fullName, email, username, passwordHash, role]
        );
        await writeAudit(connection, req.user.id, "STAFF_ACCOUNT_CREATED", "USER", insert.insertId, {
            username,
            role
        });
        await connection.commit();
        return res.status(201).json({
            status: "ok",
            message: "Staff account created.",
            staff: {
                id: String(insert.insertId),
                fullName,
                email,
                username,
                role,
                isActive: true
            }
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error.code === "ER_DUP_ENTRY") return sendDbConflict(res, error, "Could not create staff account.");
        return next(error);
    } finally {
        connection.release();
    }
}

async function updateStaff(req, res, next) {
    const userId = String(req.params.userId || "");
    if (!validId(userId)) {
        return res.status(400).json({ status: "error", message: "userId must be a numeric ID." });
    }

    const hasActive = Object.prototype.hasOwnProperty.call(req.body || {}, "isActive");
    const hasRole = Object.prototype.hasOwnProperty.call(req.body || {}, "role");
    if (!hasActive && !hasRole) {
        return res.status(400).json({ status: "error", message: "Provide isActive or role." });
    }

    const desiredActive = hasActive ? parseActive(req.body.isActive) : null;
    const desiredRole = hasRole && typeof req.body.role === "string"
        ? req.body.role.trim().toUpperCase() : null;
    if (hasActive && desiredActive === null) {
        return res.status(400).json({ status: "error", message: "isActive must be true or false." });
    }
    if (hasRole && !["STAFF", "ADMIN"].includes(desiredRole)) {
        return res.status(400).json({ status: "error", message: "role must be STAFF or ADMIN." });
    }
    if (String(req.user.id) === userId && ((hasActive && desiredActive === false) || (hasRole && desiredRole !== "ADMIN"))) {
        return res.status(400).json({ status: "error", message: "You cannot deactivate your own account or remove your own ADMIN role." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            `SELECT id, username, role, is_active AS isActive
             FROM users WHERE id = ? AND role IN ('STAFF', 'ADMIN') FOR UPDATE`,
            [userId]
        );
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ status: "error", message: "Staff account not found." });
        }

        const user = rows[0];
        if (String(req.user.id) === userId && user.role === "ADMIN" && hasRole && desiredRole !== "ADMIN") {
            await connection.rollback();
            return res.status(400).json({ status: "error", message: "You cannot remove your own ADMIN role." });
        }

        const updates = [];
        const params = [];
        const changes = {};
        if (hasActive) {
            updates.push("is_active = ?");
            params.push(desiredActive ? 1 : 0);
            changes.isActive = desiredActive;
        }
        if (hasRole) {
            updates.push("role = ?");
            params.push(desiredRole);
            changes.role = desiredRole;
        }
        params.push(userId);
        await connection.execute(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
        await writeAudit(connection, req.user.id, "STAFF_ACCOUNT_UPDATED", "USER", userId, {
            username: user.username,
            ...changes
        });
        await connection.commit();
        return res.status(200).json({ status: "ok", message: "Staff account updated." });
    } catch (error) {
        await connection.rollback().catch(() => {});
        if (error.code === "ER_DUP_ENTRY") return sendDbConflict(res, error, "Could not update staff account.");
        return next(error);
    } finally {
        connection.release();
    }
}

function parseJson(value) {
    if (value == null) return null;
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

async function listAuditLogs(req, res, next) {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    try {
        const [countRows] = await pool.execute("SELECT COUNT(*) AS total FROM audit_logs");
        const [rows] = await pool.execute(
            `SELECT
                al.id,
                al.actor_user_id AS actorUserId,
                u.full_name AS actorName,
                al.action,
                al.entity_type AS entityType,
                al.entity_id AS entityId,
                al.details_json AS details,
                al.ip_address AS ipAddress,
                al.user_agent AS userAgent,
                al.created_at AS createdAt
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.actor_user_id
             ORDER BY al.created_at DESC, al.id DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        return res.status(200).json({
            status: "ok",
            pagination: {
                total: Number(countRows[0].total),
                limit,
                offset
            },
            auditLogs: rows.map((row) => ({
                id: String(row.id),
                actorUserId: row.actorUserId == null ? null : String(row.actorUserId),
                actorName: row.actorName || "System / unavailable account",
                action: row.action,
                entityType: row.entityType,
                entityId: row.entityId == null ? null : String(row.entityId),
                details: parseJson(row.details),
                ipAddress: row.ipAddress,
                userAgent: row.userAgent,
                createdAt: row.createdAt
            }))
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listClinics,
    createClinic,
    updateClinic,
    listStaff,
    createStaff,
    updateStaff,
    listAuditLogs
};
