const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const apiRoutes = require("./routes/api.routes");

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "http://localhost:5173"
    })
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
    res.status(200).json({
        message: "Q-Guide API is running",
        healthEndpoint: "/api/health",
        loginEndpoint: "/api/auth/login"
    });
});

app.use("/api", apiRoutes);

app.use((req, res) => {
    res.status(404).json({
        status: "error",
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

app.use((err, req, res, next) => {
    console.error(
        "Unhandled server error:",
        err.code || err.message
    );

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        status: "error",
        message: "Internal server error."
    });
});

module.exports = app;