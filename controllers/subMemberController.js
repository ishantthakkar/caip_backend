const SubMember = require("../models/SubMember");

exports.createSubMember = async (req, res) => {
    try {
        const { firstName, email, phone, parentId } = req.body;

        if (!firstName || !email || !phone || !parentId) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        // Check if member already has 5 sub-members
        const count = await SubMember.countDocuments({ parentId });
        if (count >= 5) {
            return res.status(400).json({ msg: "Maximum limit of 5 sub-members reached" });
        }

        const subMember = await SubMember.create({
            firstName,
            email,
            phone,
            parentId,
            isActive: false // Default to false
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

        res.status(200).json({ msg: "Sub-member updated successfully", data: subMember });
    } catch (err) {
        res.status(500).json({ msg: "Internal server error" });
    }
};

exports.deleteSubMember = async (req, res) => {
    try {
        const { id } = req.params;
        await SubMember.findByIdAndDelete(id);
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

        if (subMember.isActive) {
            // If already active, just deactivate it
            subMember.isActive = false;
            await subMember.save();
        } else {
            // Deactivate all other sub-members for this parent
            await SubMember.updateMany({ parentId }, { isActive: false });
            // Activate this one
            subMember.isActive = true;
            await subMember.save();
        }

        res.status(200).json({ msg: "Status updated successfully", data: subMember });
    } catch (err) {
        res.status(500).json({ msg: "Internal server error" });
    }
};
