require("dotenv").config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
    console.error(
        "JWT_SECRET is missing or too short. Configure a random secret in backend/.env."
    );
    process.exit(1);
}

const app = require("./app");

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, () => {
    console.log(`Q-Guide API is running at http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Login endpoint: http://localhost:${PORT}/api/auth/login`);
});

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(
            `Port ${PORT} is already in use. Stop the other process or choose a different port.`
        );
    } else {
        console.error("Failed to start the server:", error.message);
    }
});