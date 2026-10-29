const { listActiveClinics } = require("./clinic.service");

async function list(req, res, next) {
    try {
        const clinics = await listActiveClinics();
        return res.status(200).json({
            status: "ok",
            count: clinics.length,
            clinics
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = { list };
