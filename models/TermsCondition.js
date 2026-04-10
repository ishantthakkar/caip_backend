const mongoose = require("mongoose");

const termsConditionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: false // Optional if file is uploaded
    },
    file: {
        type: String,
        required: false
    },
    status: {
        type: String,
        enum: ["Draft", "Published", "Archived"],
        default: "Draft"
    },
    version: {
        type: String,
        default: "1.0"
    }
}, { timestamps: true });

module.exports = mongoose.model("TermsCondition", termsConditionSchema);
