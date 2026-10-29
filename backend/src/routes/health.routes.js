const express = require("express");
const pool = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT DATABASE() AS databaseName, 1 AS connectionOk"
        );

        return res.status(200).json({
            status: "ok",
            service: "q-guide-api",
            database: {
                status: "connected",
                name: rows[0].databaseName
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(
            "Database health check failed:",
            error.code || error.message
        );

        return res.status(503).json({
            status: "error",
            service: "q-guide-api",
            database: {
                status: "disconnected"
            },
            message:
                "The API is running, but the database connection failed. Check XAMPP and the backend .env configuration."
        });
    }
});

module.exports = router;