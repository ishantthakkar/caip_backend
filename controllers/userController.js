const User = require("../models/User");

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 2 }).sort({ createdAt: -1 });
        return res.status(200).json({ msg: "Users fetched successfully", data: users });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Database error" });
    }
};

exports.changeStatus = async (req, res) => {
    try {
        const { userId, status, rejectionReason } = req.body;
        if (!status || ![1, 2].includes(Number(status))) {
            return res.status(400).json({ msg: "Status must be 1 (approved) or 2 (rejected)" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        user.status = Number(status);
        if (Number(status) === 2) {
            user.rejectionReason = rejectionReason || "";
        } else {
            user.rejectionReason = ""; // Clear if approved
        }
        await user.save();

        return res.status(200).json({
            msg: "User status updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                status: user.status
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        // Auto-fix for existing members who have 0 subMemberLimit
        if (user.membership_status === "1" && (user.subMemberLimit === 0 || !user.subMemberLimit)) {
            try {
                const MembershipPlan = require("../models/MembershipPlan");
                const Transaction = require("../models/Transaction");
                
                // Try to find by Transaction log if available
                const lastTx = await Transaction.findOne({ user_id: user._id }).sort({ createdAt: -1 });
                if (lastTx && lastTx.plan_id) {
                    const plan = await MembershipPlan.findById(lastTx.plan_id);
                    if (plan) {
                        user.subMemberLimit = plan.subMemberLimit;
                        user.planName = plan.name;
                        user.membershipBenefits = plan.benefits;
                        await user.save();
                    }
                } else if (user.planName) {
                    // Fallback to searching by plan name
                    const plan = await MembershipPlan.findOne({ name: user.planName });
                    if (plan) {
                        user.subMemberLimit = plan.subMemberLimit;
                        await user.save();
                    }
                } else {
                    // Default fallback for legacy members (e.g. 5 as old default)
                    user.subMemberLimit = 5;
                    await user.save();
                }
            } catch (err) {
                console.error("Self-healing subMemberLimit error:", err);
            }
        }

        return res.status(200).json({ msg: "Profile fetched successfully", data: user });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Server error" });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        const fieldsToUpdate = [
            'name', 'businessType', 'gst', 'yearsInBusiness', 'cinNumber', 'pan',
            'state', 'district', 'subDistrict', 'pinCode', 'businessAddress',
            'industry', 'companyEmail', 'alternateContactPerson',
            'companyPhoneNumber', 'alternateContactNumber', 'websiteUrl'
        ];

        fieldsToUpdate.forEach(field => {
            if (req.body[field] !== undefined) {
                user[field] = req.body[field];
            }
        });

        if (req.files && req.files.length > 0) {
            const filePaths = req.files.map(f => f.filename);
            user.businessDocuments = [...(user.businessDocuments || []), ...filePaths];
        }

        await user.save();
        return res.status(200).json({ msg: "Profile updated successfully", data: user });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error updating profile" });
    }
};
