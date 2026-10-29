function authorizeRoles(...allowedRoles) {
    return function (req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                status: "error",
                message: "Authentication is required."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                status: "error",
                message: "You do not have permission to access this resource."
            });
        }

        return next();
    };
}

module.exports = authorizeRoles;