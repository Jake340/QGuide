const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api").replace(/\/$/, "");

export class ApiError extends Error {
    constructor(message, status = 0, payload = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}

export async function apiRequest(path, { token, method = "GET", body, signal } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal
        });
    } catch (error) {
        if (error.name === "AbortError") throw error;
        throw new ApiError("Cannot reach the Q-Guide API. Confirm that the Node.js backend is running.");
    }

    let payload = null;
    const responseText = await response.text();
    if (responseText) {
        try {
            payload = JSON.parse(responseText);
        } catch {
            payload = { message: responseText };
        }
    }

    if (!response.ok) {
        throw new ApiError(
            payload?.message || `Request failed with HTTP ${response.status}.`,
            response.status,
            payload
        );
    }

    return payload;
}

export { API_BASE_URL };
