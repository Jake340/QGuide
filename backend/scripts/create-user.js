const path = require("node:path");
const readline = require("node:readline/promises");
const bcrypt = require("bcryptjs");

require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

const pool = require("../src/config/db");

const input = process.stdin;
const output = process.stdout;

function ask(question) {
    const rl = readline.createInterface({ input, output });

    return rl.question(question).finally(() => rl.close());
}

function askHidden(question) {
    if (!input.isTTY || typeof input.setRawMode !== "function") {
        return Promise.reject(
            new Error(
                "Run this script in an interactive VS Code terminal so password input can be hidden."
            )
        );
    }

    return new Promise((resolve, reject) => {
        let password = "";
        const previousRawMode = input.isRaw;

        function cleanup() {
            input.removeListener("data", onData);
            input.setRawMode(Boolean(previousRawMode));
            input.pause();
        }

        function onData(buffer) {
            for (const character of buffer.toString("utf8")) {
                if (character === "\u0003") {
                    cleanup();
                    output.write("\nCancelled.\n");
                    reject(new Error("Cancelled"));
                    return;
                }

                if (character === "\r" || character === "\n") {
                    cleanup();
                    output.write("\n");
                    resolve(password);
                    return;
                }

                if (character === "\u007f" || character === "\b") {
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        output.write("\b \b");
                    }
                } else if (character >= " " && character !== "\u001b") {
                    password += character;
                    output.write("*");
                }
            }
        }

        output.write(question);
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });
}

async function main() {
    let connection;

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing from backend/.env.");
        }

        const fullName = (await ask("Full name: ")).trim();
        const username = (await ask("Username: ")).trim();
        const emailInput = (
            await ask("Email (optional; press Enter to skip): ")
        ).trim();

        const role = (
            await ask("Role (ADMIN or STAFF): ")
        ).trim().toUpperCase();

        const email = emailInput ? emailInput.toLowerCase() : null;

        if (!fullName || fullName.length > 150) {
            throw new Error("Full name is required and must be 150 characters or fewer.");
        }

        if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
            throw new Error(
                "Username must be 3-80 characters and use only letters, numbers, dots, underscores, or hyphens."
            );
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error("Enter a valid email address or leave it blank.");
        }

        if (!["ADMIN", "STAFF"].includes(role)) {
            throw new Error("Role must be ADMIN or STAFF.");
        }

        const password = await askHidden(
            "Password (minimum 12 characters; input is masked): "
        );

        if (password.length < 12) {
            throw new Error("Password must contain at least 12 characters.");
        }

        if (Buffer.byteLength(password, "utf8") > 72) {
            throw new Error(
                "Password is too long for this bcrypt configuration. Use at most 72 UTF-8 bytes."
            );
        }

        const passwordHash = await bcrypt.hash(password, 12);

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.execute(
            `INSERT INTO users
                (full_name, email, username, password_hash, role, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [fullName, email, username, passwordHash, role]
        );

        await connection.execute(
            `INSERT INTO audit_logs
                (actor_user_id, action, entity_type, entity_id, details_json)
             VALUES (?, ?, ?, ?, ?)`,
            [
                null,
                "BOOTSTRAP_USER_CREATED",
                "USER",
                result.insertId,
                JSON.stringify({ role, username })
            ]
        );

        await connection.commit();

        console.log("\nAccount created successfully.");
        console.log(`User ID: ${result.insertId}`);
        console.log(`Username: ${username}`);
        console.log(`Role: ${role}`);
        console.log("Password stored as a hash, not plaintext.");
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        if (error.code === "ER_DUP_ENTRY") {
            console.error(
                "That username or email already exists. Choose a different one."
            );
        } else {
            console.error("Could not create account:", error.message);
        }

        process.exitCode = 1;
    } finally {
        if (connection) {
            connection.release();
        }

        await pool.end();
    }
}

main();