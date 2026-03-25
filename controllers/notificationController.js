const mongoose = require("mongoose");
const User = require("../models/User");
const Notification = require("../models/Notification");

exports.createNotification = async (req, res) => {
    try {
        const { member_ids, message_title, message_content, sending_time } = req.body;
        
        // Validation
        if (!member_ids || (Array.isArray(member_ids) && member_ids.length === 0)) {
            return res.status(400).json({ msg: "Recipient selection is required" });
        }
        if (!message_title) return res.status(400).json({ msg: "Message title is required" });
        if (!message_content) return res.status(400).json({ msg: "Message content is required" });

        const time = sending_time || new Date().toISOString();

        if (member_ids.includes('All')) {
            // Priority: Send as Global Broadcast
            await Notification.create({
                member_id: 'All',
                message_title,
                message_content,
                sending_time: time,
                read_by: []
            });
        } else {
            // Priority: Send to Specific Tagged Members
            const targetIds = Array.isArray(member_ids) ? member_ids : [member_ids];
            const notificationDocs = targetIds.map(mid => ({
                member_id: mid,
                message_title,
                message_content,
                sending_time: time,
                read_by: []
            }));
            
            await Notification.insertMany(notificationDocs);
        }

        return res.status(200).json({ msg: "Notification broadcasted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error creating notification", err: err.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        return res.status(200).json({ data: notifications });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Database error" });
    }
};

exports.getMemberNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch notifications for 'All' or specific user
        const list = await Notification.find({
            $or: [
                { member_id: 'All' },
                { member_id: userId }
            ]
        }).sort({ createdAt: -1 }).limit(20);

        return res.status(200).json({ data: list });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "DB Error" });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        const userId = req.user.id;
        await Notification.updateMany(
            { $or: [{ member_id: 'All' }, { member_id: userId }] },
            { $addToSet: { read_by: userId } }
        );
        return res.status(200).json({ msg: "Marked as read" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Mark as read error" });
    }
};
