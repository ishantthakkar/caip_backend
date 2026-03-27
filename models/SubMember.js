const mongoose = require("mongoose");

const subMemberSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: false,
    },
    phone: {
        type: String,
        required: true,
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
    },
    isActive: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

const SubMember = mongoose.model("submember", subMemberSchema);
module.exports = SubMember;
