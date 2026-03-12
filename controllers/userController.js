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
        const { userId, status } = req.body;
        if (!status || ![1, 2].includes(Number(status))) {
            return res.status(400).json({ msg: "Status must be 1 (approved) or 2 (rejected)" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        user.status = Number(status);
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
