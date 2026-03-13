const ActivityLog = require("../models/ActivityLog");

const logActivity = async (req, { userId, userRole, userName, activityType, details, parentId }) => {
    try {
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
        
        await ActivityLog.create({
            userId,
            userRole,
            userName,
            activityType,
            details,
            ipAddress,
            parentId: parentId || userId // If no parentId provided, assume it's the member themselves
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
};

module.exports = logActivity;
