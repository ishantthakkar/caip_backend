const mongoose = require("mongoose");

const membershipPlanSchema = new mongoose.Schema({
    plan_name: String,
    price: Number,
    duration: String,
    start_date: Date,
    end_date: Date,
    benefits: String,
    status: { type: Number, default: 1 }
}, { timestamps: true });

const MembershipPlan = mongoose.model("membership_plan", membershipPlanSchema, "membership_plans");
module.exports = MembershipPlan;
