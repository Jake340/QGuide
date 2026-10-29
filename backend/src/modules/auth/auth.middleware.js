const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const TOKEN_ISSUER = "q-guide-api";
const TOKEN_AUDIENCE = "q-guide-client";

async function authenticateToken(req, res, next) {
    const authorization = req.get("authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            status: "error",
            message: "Authentication token is required."
        });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
        return res.status(401).json({
            status: "error",
            message: "Authentication token is required."
        });
    }

    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"],
                issuer: TOKEN_ISSUER,
                audience: TOKEN_AUDIENCE
            }
        );

        if (!payload.sub || !/^\d+$/.test(String(payload.sub))) {
            return res.status(401).json({
                status: "error",
                message: "Invalid authentication token."
            });
        }

        const [rows] = await pool.execute(
            `SELECT id, full_name, email, username, role, is_active
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [payload.sub]
        );

        if (!rows.length || !Number(rows[0].is_active)) {
            return res.status(401).json({
                status: "error",
                message: "This account is unavailable."
            });
        }

        const user = rows[0];

        req.user = {
            id: String(user.id),
            fullName: user.full_name,
            email: user.email,
            username: user.username,
            role: user.role
        };

        return next();
    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                status: "error",
                message: "Invalid or expired authentication token."
            });
        }

        return next(error);
    }
}

module.exports = authenticateToken;