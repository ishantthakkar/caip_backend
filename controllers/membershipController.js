const mongoose = require("mongoose");
const MembershipPlan = require("../models/MembershipPlan");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Transaction = require("../models/Transaction");

exports.getMembershipPlans = async (req, res) => {
    try {
        console.log('Fetching active membership plans...');
        const plans = await MembershipPlan.find({ isActive: true }).sort({ createdAt: -1 });
        return res.status(200).json({ data: plans });
    } catch (err) {
        console.error('Error fetching membership plans:', err);
        return res.status(500).json({ msg: "Server error", error: err.message });
    }
};

exports.getAllMembershipPlans = async (req, res) => {
    try {
        const plans = await MembershipPlan.find().sort({ createdAt: -1 });
        return res.status(200).json({ data: plans });
    } catch (err) {
        return res.status(500).json({ msg: "Server error" });
    }
};

exports.purchaseMembership = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        const { planId } = req.body;

        let plan;
        if (planId === 'debug-plan') {
            plan = {
                _id: 'debug-plan',
                duration: '1 year',
                price: 3000,
                name: 'Standard Membership (Debug)'
            };
        } else {
            if (!mongoose.Types.ObjectId.isValid(planId)) {
                return res.status(400).json({ msg: "Invalid Plan ID" });
            }
            plan = await MembershipPlan.findById(planId);
        }

        if (!plan) return res.status(404).json({ msg: "Plan not found" });

        let membershipExpiry;
        const durationLower = plan.duration.toLowerCase();
        if (durationLower.includes("lifetime") || durationLower.includes("life time")) {
            membershipExpiry = "Lifetime";
        } else {
            const expiryDate = new Date();
            if (plan.duration.toLowerCase().includes("year")) {
                const years = parseInt(plan.duration) || 1;
                expiryDate.setFullYear(expiryDate.getFullYear() + years);
            } else if (plan.duration.toLowerCase().includes("month")) {
                const months = parseInt(plan.duration) || 1;
                expiryDate.setMonth(expiryDate.getMonth() + months);
            } else {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            }
            membershipExpiry = expiryDate.toISOString();
        }

        user.membership_status = "1";
        user.membershipExpiry = membershipExpiry;
        user.membershipBenefits = plan.benefits || (planId === 'debug-plan' ? ['Search defaulter database', 'Report defaulter'] : []);
        user.planName = plan.name || (planId === 'debug-plan' ? 'Standard Membership (Debug)' : '');
        user.subMemberLimit = plan.subMemberLimit || (planId === 'debug-plan' ? 5 : 0);
        if (!user.memberId) {
            user.memberId = `CAIP${Math.floor(1000 + Math.random() * 9000)}`;
        }
        await user.save();

        // Notify Admin
        await Notification.create({
            member_id: 'Admin',
            message_title: "New Membership Purchase",
            message_content: `User ${user.name} (${user.companyName}) has purchased the ${user.planName}.`,
            sending_time: new Date().toISOString()
        });

        // Record Transaction
        const txNo = `TRN${Date.now()}${Math.floor(Math.random() * 1000)}`;
        await Transaction.create({
            txNo,
            user_id: user._id,
            amount: plan.price,
            plan_id: planId === 'debug-plan' ? null : plan._id,
            type: 'New Membership'
        });

        return res.status(200).json({ msg: "Membership activated!", user });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error processing payment" });
    }
};

// Admin CRUD
exports.createMemberPlan = async (req, res) => {
    try {
        const { name, price, duration, benefits, subMemberLimit } = req.body;
        const plan = await MembershipPlan.create({
            name,
            price,
            duration,
            benefits: Array.isArray(benefits) ? benefits : benefits.split(",").map(b => b.trim()),
            subMemberLimit: parseInt(subMemberLimit) || 0
        });
        return res.status(201).json({ msg: "Plan created", data: plan });
    } catch (err) {
        return res.status(500).json({ msg: "Error creating plan", error: err.message });
    }
};

exports.updateMemberPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, duration, benefits, subMemberLimit, isActive } = req.body;
        
        const updateData = {
            name,
            price,
            duration,
            benefits: Array.isArray(benefits) ? benefits : (typeof benefits === 'string' ? benefits.split(",").map(b => b.trim()) : benefits),
            subMemberLimit: parseInt(subMemberLimit) || 0
        };

        if (isActive !== undefined) {
            updateData.isActive = isActive;
        }

        const plan = await MembershipPlan.findByIdAndUpdate(id, updateData, { new: true });
        if (!plan) return res.status(404).json({ msg: "Plan not found" });
        return res.status(200).json({ msg: "Plan updated", data: plan });
    } catch (err) {
        return res.status(500).json({ msg: "Error updating plan", error: err.message });
    }
};

exports.deleteMemberPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await MembershipPlan.findByIdAndDelete(id);
        if (!plan) return res.status(404).json({ msg: "Plan not found" });
        return res.status(200).json({ msg: "Plan deleted" });
    } catch (err) {
        return res.status(500).json({ msg: "Error deleting plan" });
    }
};

exports.getPaymentReconciliation = async (req, res) => {
    try {
        const { search, startDate, endDate } = req.query;
        let query = {};

        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }

        let transactions = await Transaction.find(query)
            .populate('user_id', 'name companyName memberId')
            .populate({ path: 'plan_id', select: 'name', model: 'membershipplan' })
            .sort({ createdAt: -1 });

        // Search filter (Post-fetch for regex on populated fields if needed, or refine query)
        if (search) {
            const term = search.toLowerCase();
            transactions = transactions.filter(tx =>
                tx.txNo.toLowerCase().includes(term) ||
                (tx.user_id?.name || '').toLowerCase().includes(term) ||
                (tx.user_id?.companyName || '').toLowerCase().includes(term) ||
                (tx.user_id?.memberId || '').toLowerCase().includes(term)
            );
        }

        return res.status(200).json({ data: transactions });
    } catch (err) {
        console.error("Reconciliation fetch error:", err);
        return res.status(500).json({ msg: "Error fetching reconciliation data" });
    }
};
