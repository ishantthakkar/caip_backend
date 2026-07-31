const mongoose = require("mongoose");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendToDevice } = require("../services/firebaseService");

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
            // Optionally send push to token list if provided
            if (req.body.device_tokens && Array.isArray(req.body.device_tokens)) {
                const payload = { title: message_title, body: message_content };
                for (const token of req.body.device_tokens) {
                    try { await sendToDevice(token, payload); } catch (e) { console.error('Push error', e.message); }
                }
            }
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

exports.getMobileNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await Notification.find({
            $and: [
                {
                    $or: [
                        { member_id: 'All' },
                        { member_id: userId }
                    ]
                },
                {
                    message_title: { $regex: '^New Defaulter Reported$', $options: 'i' }
                }
            ]
        }).sort({ createdAt: -1 }).limit(50);

        const formatted = list.map((item) => ({
            ...item.toObject(),
            is_read: item.read_by.includes(userId)
        }));

        const readNotifications = formatted.filter((item) => item.is_read);
        const unreadNotifications = formatted.filter((item) => !item.is_read);

        return res.status(200).json({
            msg: "Mobile notifications fetched successfully",
            notifications: formatted,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "DB Error" });
    }
};

exports.markNotificationReadStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { notification_id, is_read } = req.body;

        if (!notification_id) {
            return res.status(400).json({ msg: "Notification ID is required" });
        }

        const shouldMarkRead = typeof is_read === 'boolean' ? is_read : true;

        const notification = await Notification.findOne({
            _id: notification_id,
            $or: [
                { member_id: 'All' },
                { member_id: userId }
            ]
        });

        if (!notification) {
            return res.status(404).json({ msg: "Notification not found" });
        }

        if (shouldMarkRead) {
            await Notification.updateOne(
                { _id: notification_id },
                { $addToSet: { read_by: userId } }
            );
        } else {
            await Notification.updateOne(
                { _id: notification_id },
                { $pull: { read_by: userId } }
            );
        }

        const updatedNotification = await Notification.findById(notification_id);

        return res.status(200).json({
            msg: shouldMarkRead ? "Notification marked as read" : "Notification marked as unread",
            data: {
                _id: updatedNotification._id,
                is_read: updatedNotification.read_by.includes(userId)
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Mark notification status error" });
    }
};

exports.getAdminAlerts = async (req, res) => {
    try {
        // Fetch notifications specifically for 'Admin'
        const list = await Notification.find({ member_id: 'Admin' }).sort({ createdAt: -1 }).limit(30);
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

exports.markAdminAlertsRead = async (req, res) => {
    try {
        const adminId = req.user.id;
        await Notification.updateMany(
            { member_id: 'Admin' },
            { $addToSet: { read_by: adminId } }
        );
        return res.status(200).json({ msg: "Admin alerts cleared" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Admin read error" });
    }
};
