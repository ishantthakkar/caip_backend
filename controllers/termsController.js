const TermsCondition = require("../models/TermsCondition");

exports.getPublishedTerms = async (req, res) => {
    try {
        const terms = await TermsCondition.findOne({ status: "Published" }).sort({ updatedAt: -1 });
        return res.status(200).json({ msg: "Published terms fetched successfully", data: terms });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching terms" });
    }
};

exports.adminGetTerms = async (req, res) => {
    try {
        const terms = await TermsCondition.find().sort({ createdAt: -1 });
        return res.status(200).json({ msg: "All terms fetched successfully", data: terms });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching terms" });
    }
};

exports.adminCreateTerms = async (req, res) => {
    try {
        const { title, content, status } = req.body;
        const file = req.file ? req.file.filename : null;

        if (status === "Published") {
            await TermsCondition.updateMany({ status: "Published" }, { $set: { status: "Archived" } });
        }

        const newTerms = new TermsCondition({ title, content, status, file });
        await newTerms.save();

        return res.status(201).json({ msg: "T&C created successfully", data: newTerms });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error creating T&C" });
    }
};

exports.adminUpdateTerms = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, status } = req.body;
        const updateData = { title, content, status };
        
        if (req.file) {
            updateData.file = req.file.filename;
        }

        if (status === "Published") {
            await TermsCondition.updateMany({ _id: { $ne: id }, status: "Published" }, { $set: { status: "Archived" } });
        }

        const updatedTerms = await TermsCondition.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        return res.status(200).json({ msg: "T&C updated successfully", data: updatedTerms });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error updating T&C" });
    }
};

exports.adminDeleteTerms = async (req, res) => {
    try {
        const { id } = req.params;
        const term = await TermsCondition.findById(id);
        if (term.status === "Published") {
            return res.status(400).json({ msg: "Cannot delete published T&C. Publish another one first." });
        }
        await TermsCondition.findByIdAndDelete(id);
        return res.status(200).json({ msg: "T&C deleted successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error deleting T&C" });
    }
};
