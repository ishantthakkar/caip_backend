const mongoose = require("mongoose");
const MembershipPlan = require("../models/MembershipPlan");
const User = require("../models/User");

const Transaction = require("../models/Transaction");

exports.getMembershipPlans = async (req, res) => {
    try {
        console.log('Fetching membership plans...');
        const rawCollection = mongoose.connection.db.collection('membership_plans');
        let plans = await rawCollection.find({ status: 1 }).toArray();

        if (plans.length === 0) {
            plans = await rawCollection.find({}).toArray();
        }

        if (plans.length === 0) {
            plans = [{
                _id: 'debug-plan',
                plan_name: 'Standard Membership (Debug)',
                price: 3000,
                duration: '1 year',
                benefits: 'Search defaulter database.\nReport defaulter.'
            }];
        }

        return res.status(200).json({ data: plans });
    } catch (err) {
        console.error('Error fetching membership plans:', err);
        return res.status(500).json({ msg: "Server error", error: err.message });
    }
};

exports.purchaseMembership = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        const { planId } = req.body;
        const plan = await MembershipPlan.findById(planId);
        if (!plan) return res.status(404).json({ msg: "Plan not found" });

        const expiryDate = new Date();
        if (plan.duration.includes("year")) {
            const years = parseInt(plan.duration) || 1;
            expiryDate.setFullYear(expiryDate.getFullYear() + years);
        } else if (plan.duration.includes("month")) {
            const months = parseInt(plan.duration) || 1;
            expiryDate.setMonth(expiryDate.getMonth() + months);
        } else {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        }

        user.membership_status = "1";
        user.membershipExpiry = expiryDate.toISOString().split('T')[0];
        if (!user.memberId) {
            user.memberId = `CAIP${Math.floor(1000 + Math.random() * 9000)}`;
        }
        await user.save();

        // Record Transaction
        const txNo = `TRN${Date.now()}${Math.floor(Math.random() * 1000)}`;
        await Transaction.create({
            txNo,
            user_id: user._id,
            amount: plan.price,
            plan_id: plan._id,
            type: 'New Membership'
        });

        return res.status(200).json({ msg: "Membership activated!", user });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error processing payment" });
    }
};

