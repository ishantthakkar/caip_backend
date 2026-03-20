const mongoose = require("mongoose");

const membershipPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    duration: {
        type: String, // e.g., "1 Month", "1 Year"
        required: true,
    },
    benefits: {
        type: [String], // Array of strings for points
        default: [],
    },
    subMemberLimit: {
        type: Number,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

const MembershipPlan = mongoose.model("membershipplan", membershipPlanSchema);
module.exports = MembershipPlan;
