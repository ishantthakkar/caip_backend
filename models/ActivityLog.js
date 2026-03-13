const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    userRole: {
        type: String, // 'member' or 'sub-member' or 'admin'
        required: true,
    },
    userName: {
        type: String,
        required: true,
    },
    activityType: {
        type: String, // 'System Login', 'System Logout', 'Defaulter Search', etc.
        required: true,
    },
    details: {
        type: String,
        required: true,
    },
    ipAddress: {
        type: String,
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId, // The primary member's ID
        required: false, // For admin it might be null
    }
}, { timestamps: true });

const ActivityLog = mongoose.model("activitylog", activityLogSchema);
module.exports = ActivityLog;
