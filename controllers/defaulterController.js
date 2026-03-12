const mongoose = require("mongoose");
const User = require("../models/User");
const DefaulterReport = require("../models/DefaulterReport");
const SearchHistory = require("../models/SearchHistory");

exports.reportDefaulter = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        const attachment_documents = req.files ? req.files.map(f => f.filename) : [];

        const report = new DefaulterReport({
            ...req.body,
            user_id: user._id,
            attachment_documents,
            status: 1 // Automatically approved for now
        });

        await report.save();
        return res.status(201).json({ msg: "Defaulter reported successfully", data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error reporting defaulter" });
    }
};

exports.searchDefaulter = async (req, res) => {
    try {
        const { gst, pan, cin, aadhar, name, state, district, subDistrict, address, includePending } = req.query;
        let query = includePending === 'true' ? {} : { status: 1 };

        if (gst) query.gst_number = { $regex: gst, $options: "i" };
        if (pan) query.pan_number = { $regex: pan, $options: "i" };
        if (cin) query.cin_number = { $regex: cin, $options: "i" };
        if (aadhar) query.aadhar_number = { $regex: aadhar, $options: "i" };
        if (name) {
            const keywords = name.trim().split(/\s+/).filter(k =>
                k.length > 2 && !['limited', 'private', 'pvt', 'ltd', 'company', 'corp'].includes(k.toLowerCase())
            );
            if (keywords.length > 0) {
                query.defaulter_name = {
                    $regex: `(${[name, ...keywords].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
                    $options: "i"
                };
            } else {
                query.defaulter_name = { $regex: name, $options: "i" };
            }
        }
        if (address) {
            const addrKeywords = address.trim().split(/\s+/).filter(k => k.length > 3);
            if (addrKeywords.length > 0) {
                query.defaulter_address = {
                    $regex: `(${[address, ...addrKeywords].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
                    $options: "i"
                };
            } else {
                query.defaulter_address = { $regex: address, $options: "i" };
            }
        }
        if (state) query.state = state;
        if (district) query.district = district;
        if (subDistrict) query.cities = subDistrict;

        const reports = await DefaulterReport.find(query).populate('user_id', 'companyName').sort({ createdAt: -1 });

        let historyFilters = { gst, pan, cin, aadhar, name, state, district, subDistrict, address };
        if (reports.length > 0) {
            const first = reports[0];
            historyFilters = {
                ...historyFilters,
                name: first.defaulter_name,
                gst: first.gst_number,
                pan: first.pan_number,
                cin: first.cin_number,
                aadhar: first.aadhar_number,
                state: first.state,
                district: first.district,
                subDistrict: first.cities,
                address: first.defaulter_address,
                email: first.email_id,
                mobile: first.mobile_number,
                industry: first.industry,
                financial_year: first.financial_year,
                default_amount: first.default_amount,
                outstanding_amount: first.outstanding_amount,
                date_of_default: first.date_of_default,
                reason: first.reason_description,
                court_complex_name: first.court_complex_name,
                case_number: first.case_number,
                case_type: first.case_type,
                case_year: first.case_year,
                case_status: first.case_status,
                attachment_documents: first.attachment_documents,
                payments: first.payments,
                reported_by: first.user_id?.companyName || 'Verified Member'
            };
        }

        await SearchHistory.create({
            user_id: req.user.id,
            filters: historyFilters,
            resultCount: reports.length
        });

        return res.status(200).json({ data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error searching defaulters" });
    }
};

exports.getMyReports = async (req, res) => {
    try {
        const reports = await DefaulterReport.find({ user_id: req.user.id }).sort({ createdAt: -1 });
        return res.status(200).json({ data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching your reports" });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const myReports = await DefaulterReport.find({ user_id: userId }).sort({ createdAt: -1 }).limit(5);
        const totalReported = await DefaulterReport.countDocuments({ user_id: userId });
        const aggregateSum = await DefaulterReport.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, total: { $sum: "$default_amount" } } }
        ]);

        const recoveredSum = await DefaulterReport.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
            { $unwind: { path: "$payments", preserveNullAndEmptyArrays: false } },
            { $group: { _id: null, total: { $sum: "$payments.amount" } } }
        ]);

        const searchHistory = await SearchHistory.find({ user_id: userId }).sort({ createdAt: -1 }).limit(5);

        const industryDist = await DefaulterReport.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: "$industry", count: { $sum: 1 } } }
        ]);

        const stateInsights = await DefaulterReport.aggregate([
            { $group: { _id: "$state", count: { $sum: 1 }, totalAmount: { $sum: "$default_amount" } } },
            { $sort: { count: -1 } }
        ]);

        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const searchTrend = await SearchHistory.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(userId), createdAt: { $gte: startOfYear } } },
            { $group: { _id: { month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { "_id.month": 1 } }
        ]);

        return res.status(200).json({
            summary: {
                totalReported,
                totalAmount: aggregateSum[0]?.total || 0,
                totalRecovered: recoveredSum[0]?.total || 0
            },
            myReports,
            searchHistory,
            industryDist: industryDist.map(item => ({ name: item._id || 'Uncategorized', value: item.count })),
            stateInsights: stateInsights.map(item => ({ state: item._id || 'N/A', count: item.count, amount: item.totalAmount })),
            searchTrend: searchTrend.map(item => ({ month: item._id.month, count: item.count }))
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching dashboard statistics" });
    }
};

exports.getSearchHistory = async (req, res) => {
    try {
        const history = await SearchHistory.find({ user_id: req.user.id })
            .populate('user_id', 'name')
            .sort({ createdAt: -1 })
            .limit(50);
        return res.status(200).json({ data: history });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching search history" });
    }
};

exports.updateReport = async (req, res) => {
    try {
        const report = await DefaulterReport.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!report) return res.status(404).json({ msg: "Report not found or unauthorized" });

        const updateData = { ...req.body };
        if (req.files && req.files.length > 0) {
            const newFiles = req.files.map(f => f.filename);
            updateData.attachment_documents = [...(report.attachment_documents || []), ...newFiles];
        }

        const updatedReport = await DefaulterReport.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        return res.status(200).json({ msg: "Report updated successfully", data: updatedReport });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error updating report" });
    }
};

exports.addPayment = async (req, res) => {
    try {
        const report = await DefaulterReport.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!report) return res.status(404).json({ msg: "Report not found or unauthorized" });

        const { payments } = req.body;
        if (!Array.isArray(payments)) {
            return res.status(400).json({ msg: "Invalid payments data" });
        }

        report.payments = [...(report.payments || []), ...payments];
        const totalPaid = report.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        report.outstanding_amount = Math.max(0, report.default_amount - totalPaid);

        await report.save();
        return res.status(200).json({ msg: "Payment added successfully", data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error adding payment" });
    }
};

exports.getAdminDashboardStats = async (req, res) => {
    try {
        const totalReported = await DefaulterReport.countDocuments();

        const aggregateSum = await DefaulterReport.aggregate([
            { $group: { _id: null, total: { $sum: "$default_amount" } } }
        ]);

        const recoveredSum = await DefaulterReport.aggregate([
            { $unwind: { path: "$payments", preserveNullAndEmptyArrays: false } },
            { $group: { _id: null, total: { $sum: "$payments.amount" } } }
        ]);

        const industryDist = await DefaulterReport.aggregate([
            { $group: { _id: "$industry", count: { $sum: 1 } } }
        ]);

        const stateInsights = await DefaulterReport.aggregate([
            {
                $group: {
                    _id: "$state",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$default_amount" },
                    totalRecovered: {
                        $sum: {
                            $subtract: ["$default_amount", { $ifNull: ["$outstanding_amount", "$default_amount"] }]
                        }
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const searchTrend = await SearchHistory.aggregate([
            { $match: { createdAt: { $gte: startOfYear } } },
            { $group: { _id: { month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { "_id.month": 1 } }
        ]);

        const recentReports = await DefaulterReport.find()
            .populate('user_id', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        const searchHistory = await SearchHistory.find()
            .populate('user_id', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        const dbTransactions = await require("../models/Transaction").find()
            .populate('user_id', 'name companyName')
            .sort({ createdAt: -1 })
            .limit(5);

        const transactions = dbTransactions.map(tx => ({
            id: tx._id,
            txNo: tx.txNo,
            member: tx.user_id?.name || 'Unknown',
            company: tx.user_id?.companyName || 'N/A',
            amount: tx.amount,
            type: tx.type
        }));

        return res.status(200).json({
            summary: {
                totalReported,
                totalAmount: aggregateSum[0]?.total || 0,
                totalRecovered: recoveredSum[0]?.total || 0
            },
            industryDist: industryDist.map(item => ({ name: item._id || 'Uncategorized', value: item.count })),
            stateInsights: stateInsights.map(item => ({
                state: item._id || 'N/A',
                count: item.count,
                amount: item.totalAmount,
                recovered: item.totalRecovered
            })),
            searchTrend: searchTrend.map(item => ({ month: item._id.month, count: item.count })),
            recentReports,
            searchHistory,
            transactions
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching admin statistics" });
    }
};

exports.adminGetAllDefaulters = async (req, res) => {
    try {
        const reports = await DefaulterReport.find().populate('user_id', 'name email').sort({ createdAt: -1 });
        return res.status(200).json({ msg: "Defaulters fetched successfully", data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Database error" });
    }
};

exports.adminChangeStatus = async (req, res) => {
    try {
        const { reportId, status } = req.body;
        if (!status || ![1, 2].includes(Number(status))) {
            return res.status(400).json({ msg: "Status must be 1 (approved) or 2 (rejected)" });
        }
        const report = await DefaulterReport.findById(reportId);
        if (!report) return res.status(404).json({ msg: "Report not found" });

        report.status = Number(status);
        await report.save();

        return res.status(200).json({ msg: "Report status updated successfully", data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};

exports.adminGetDefaultersByMember = async (req, res) => {
    try {
        const { userId } = req.params;
        const reports = await require("../models/DefaulterReport").find({ user_id: userId }).sort({ createdAt: -1 });
        return res.status(200).json({ msg: "Member defaulters fetched", data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Database error" });
    }
};
