const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    member_id: {
        type: String,
        required: true,
    },
    message_title: {
        type: String,
        required: true,
    },
    message_content: {
        type: String,
        required: true,
    },
    sending_time: {
        type: String,
        required: false,
    },
    read_by: {
        type: [String],
        default: []
    }

}, { timestamps: true });

const Notification = mongoose.model("notification", notificationSchema);
module.exports = Notification;
