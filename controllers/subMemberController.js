const SubMember = require("../models/SubMember");
const logActivity = require("../middleware/activityLogger");
const User = require("../models/User");
const Notification = require("../models/Notification");

exports.createSubMember = async (req, res) => {
    try {
        const { firstName, email, phone, parentId } = req.body;

        if (!firstName || !phone || !parentId) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        // Check if member already has reached their plan's sub-member limit
        const parentUser = await User.findById(parentId);
        const limit = parentUser?.subMemberLimit || 0;
        const count = await SubMember.countDocuments({ parentId });

        if (count >= limit) {
            return res.status(400).json({ msg: `Maximum limit of ${limit} sub-members reached for your current plan` });
        }

        const subMember = await SubMember.create({
            firstName,
            email,
            phone,
            parentId,
            isActive: true // Default to true
        });

        // Notify Member
        await Notification.create({
            member_id: parentId,
            message_title: "Sub-member Added",
            message_content: `A new sub-member account for ${firstName} (${email}) has been successfully created.`,
            sending_time: new Date().toISOString()
        });

        // Log the activity
        await logActivity(req, {
            userId: parentId,
            userRole: 'member',
            userName: parentUser?.name || 'Member',
            activityType: 'Sub-Member Added',
            details: `Added new sub-member: ${firstName} (${email})`,
            parentId: parentId
        });

        res.status(201).json({ msg: "Sub-member created successfully", data: subMember });
    } catch (err) {
        console.error("Create SubMember Error:", err);
        res.status(500).json({ msg: "Internal server error" });
    }
};

exports.getSubMembers = async (req, res) => {
    try {
        const { parentId } = req.params;
        const subMembers = await SubMember.find({ parentId }).sort({ createdAt: -1 });
        res.status(200).json({ data: subMembers });
    } catch (err) {
        res.status(500).json({ msg: "Internal server error" });
    }
};

exports.updateSubMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, email, phone } = req.body;

        const subMember = await SubMember.findByIdAndUpdate(id, { firstName, email, phone }, { new: true });
        if (!subMember) return res.status(404).json({ msg: "Sub-member not found" });

        // Log the activity
        const parentUser = await User.findById(subMember.parentId);
        await logActivity(req, {
            userId: subMember.parentId,
            userRole: 'member',
            userName: parentUser?.name || 'Member',
            activityType: 'Profile Update',
            details: `Updated sub-member info for: ${firstName}`,
            parentId: subMember.parentId
        });

        res.status(200).json({ msg: "Sub-member updated successfully", data: subMember });
    } catch (err) {
        res.status(500).json({ msg: "Internal server error" });
    }
};

exports.deleteSubMember = async (req, res) => {
    try {
        const { id } = req.params;
        const subMember = await SubMember.findById(id);
        if (!subMember) return res.status(404).json({ msg: "Sub-member not found" });

        const parentId = subMember.parentId;
        const subMemberName = subMember.firstName;

        await SubMember.findByIdAndDelete(id);

        // Log the activity
        const parentUser = await User.findById(parentId);
        await logActivity(req, {
            userId: parentId,
            userRole: 'member',
            userName: parentUser?.name || 'Member',
            activityType: 'Sub-Member Deleted',
            details: `Removed sub-member: ${subMemberName}`,
            parentId: parentId
        });

        res.status(200).json({ msg: "Sub-member deleted successfully" });
    } catch (err) {
        res.status(500).json({ msg: "Internal server error" });
    }
};

exports.toggleActiveStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { parentId } = req.body;

        const subMember = await SubMember.findById(id);
        if (!subMember) return res.status(404).json({ msg: "Sub-member not found" });

        let action = "";
        if (subMember.isActive) {
            subMember.isActive = false;
            action = "Deactivated";
        } else {
            // Deactivate all other sub-members for this parent
            await SubMember.updateMany({ parentId }, { isActive: false });
            subMember.isActive = true;
            action = "Activated";
        }
        await subMember.save();

        // Log the activity
        const parentUser = await User.findById(parentId);
        await logActivity(req, {
            userId: parentId,
            userRole: 'member',
            userName: parentUser?.name || 'Member',
            activityType: `Sub-Member ${action}`,
            details: `${action} sub-member: ${subMember.firstName}`,
            parentId: parentId
        });

        res.status(200).json({ msg: "Status updated successfully", data: subMember });
    } catch (err) {
        res.status(500).json({ msg: "Internal server error" });
    }
};
