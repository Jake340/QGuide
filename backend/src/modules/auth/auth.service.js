const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../config/db");

const TOKEN_ISSUER = "q-guide-api";
const TOKEN_AUDIENCE = "q-guide-client";

const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";

async function writeAuditLog({
    actorUserId = null,
    action,
    entityType,
    entityId = null,
    details = {},
    ipAddress = null,
    userAgent = null
}) {
    try {
        await pool.execute(
            `INSERT INTO audit_logs
                (actor_user_id, action, entity_type, entity_id,
                 details_json, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                actorUserId,
                action,
                entityType,
                entityId,
                JSON.stringify(details),
                ipAddress,
                userAgent ? userAgent.slice(0, 255) : null
            ]
        );
    } catch (error) {
        // A logging failure must not expose database details to the client.
        console.error(
            "Audit log write failed:",
            error.code || error.message
        );
    }
}

async function loginUser(identifier, password, metadata = {}) {
    const cleanIdentifier = identifier.trim();

    const [rows] = await pool.execute(
        `SELECT
            id,
            full_name,
            email,
            username,
            password_hash,
            role,
            is_active
         FROM users
         WHERE username = ? OR email = ?
         LIMIT 1`,
        [cleanIdentifier, cleanIdentifier]
    );

    const user = rows[0];

    if (!user || !Number(user.is_active)) {
        await writeAuditLog({
            action: "LOGIN_FAILED",
            entityType: "AUTHENTICATION",
            details: { outcome: "failure" },
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent
        });

        return null;
    }

    const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
    );

    if (!passwordMatches) {
        await writeAuditLog({
            actorUserId: user.id,
            action: "LOGIN_FAILED",
            entityType: "USER",
            entityId: user.id,
            details: { outcome: "failure" },
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent
        });

        return null;
    }

    await pool.execute(
        `UPDATE users
         SET last_login_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [user.id]
    );

    await writeAuditLog({
        actorUserId: user.id,
        action: "LOGIN_SUCCESS",
        entityType: "USER",
        entityId: user.id,
        details: { role: user.role },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
    });

    const accessToken = jwt.sign(
        { sub: String(user.id) },
        process.env.JWT_SECRET,
        {
            algorithm: "HS256",
            expiresIn: TOKEN_EXPIRES_IN,
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE
        }
    );

    return {
        accessToken,
        tokenType: "Bearer",
        expiresIn: TOKEN_EXPIRES_IN,
        user: {
            id: String(user.id),
            fullName: user.full_name,
            email: user.email,
            username: user.username,
            role: user.role
        }
    };
}

module.exports = {
    loginUser,
    TOKEN_ISSUER,
    TOKEN_AUDIENCE
};