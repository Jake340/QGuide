const { loginUser } = require("./auth.service");

async function login(req, res, next) {
    try {
        const identifier =
            typeof req.body?.identifier === "string"
                ? req.body.identifier.trim()
                : "";

        const password =
            typeof req.body?.password === "string"
                ? req.body.password
                : "";

        if (!identifier || !password) {
            return res.status(400).json({
                status: "error",
                message: "Username/email and password are required."
            });
        }

        const result = await loginUser(identifier, password, {
            ipAddress: req.ip,
            userAgent: req.get("user-agent")
        });

        if (!result) {
            return res.status(401).json({
                status: "error",
                message: "Invalid username/email or password."
            });
        }

        return res.status(200).json({
            status: "ok",
            ...result
        });
    } catch (error) {
        next(error);
    }
}

function getCurrentUser(req, res) {
    return res.status(200).json({
        status: "ok",
        user: req.user
    });
}

module.exports = {
    login,
    getCurrentUser
};