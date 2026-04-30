const mongoose = require("mongoose");
const User = require("../models/User");
const DefaulterReport = require("../models/DefaulterReport");
const SearchHistory = require("../models/SearchHistory");
const ActivityLog = require("../models/ActivityLog");
const DownloadedReport = require("../models/DownloadedReport");
const logActivity = require("../middleware/activityLogger");
const Notification = require("../models/Notification");
const emailService = require("../utils/emailService");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const PDFTable = require("pdfkit-table");

exports.checkDuplicates = async (req, res) => {
    try {
        const { gst, pan, mobile, address, name } = req.query;
        if (!gst && !pan && !mobile && !address && !name) return res.status(400).json({ msg: "Query required" });

        const queries = [];
        if (gst) queries.push({ gst_number: gst });
        if (pan) queries.push({ pan_number: pan });
        if (mobile) queries.push({ mobile_number: mobile });
        if (address) queries.push({ defaulter_address: address });
        if (name) queries.push({ defaulter_name: { $regex: new RegExp(`^${name}$`, "i") } });

        const existing = await DefaulterReport.findOne({ $or: queries });
        if (existing) {
            const matchedFields = [];
            if (gst && existing.gst_number === gst) matchedFields.push("GST");
            if (pan && existing.pan_number === pan) matchedFields.push("PAN");
            if (mobile && existing.mobile_number === mobile) matchedFields.push("Mobile");
            if (address && existing.defaulter_address === address) matchedFields.push("Address");
            if (name && existing.defaulter_name?.toLowerCase() === name.toLowerCase()) matchedFields.push("Defaulter Name");

            const field = matchedFields.length > 0 ? matchedFields.join(", ") : "Details";
            return res.status(200).json({ exists: true, field });
        }
        return res.status(200).json({ exists: false });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal Error" });
    }
};

exports.reportDefaulter = async (req, res) => {
    try {
        const userId = req.user.parentId || req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        const attachment_documents = req.files ? req.files.map(f => f.filename) : [];

        const isSubMember = !!req.user.parentId;
        const organizationId = isSubMember ? req.user.parentId : req.user.id;

        const reportData = { ...req.body };
        if (reportData.legal_status_taken === 'true') reportData.legal_status_taken = true;
        if (reportData.legal_status_taken === 'false') reportData.legal_status_taken = false;

        if (typeof reportData.defaulter_persons === 'string') {
            try {
                reportData.defaulter_persons = JSON.parse(reportData.defaulter_persons);
            } catch (e) {
                reportData.defaulter_persons = [];
            }
        }

        const report = new DefaulterReport({
            ...reportData,
            user_id: organizationId,
            reported_by_id: req.user.id,
            reported_by_role: isSubMember ? 'sub-member' : 'member',
            attachment_documents,
            status: 1 // Automatically approve all reports (including sub-members)
        });

        await report.save();

        // Send Email Notification
        emailService.sendDefaulterAdditionEmail(
            { name: user.name, email: user.email, companyName: user.companyName },
            report
        );

        // System Notification for the reporter
        await Notification.create({
            member_id: req.user.id,
            message_title: "Defaulter Added",
            message_content: `Your report for ${req.body.defaulter_name} has been successfully submitted and stored.`,
            sending_time: new Date().toISOString()
        });

        // Notify Parent if sub-member
        if (isSubMember) {
            await Notification.create({
                member_id: organizationId,
                message_title: "New Sub-member Activity",
                message_content: `Your sub-member ${req.user.name} has added a new defaulter: ${req.body.defaulter_name}.`,
                sending_time: new Date().toISOString()
            });
        }

        // Notify Admin
        await Notification.create({
            member_id: 'Admin',
            message_title: "New Defaulter Reported",
            message_content: `A new defaulter ${req.body.defaulter_name} (${req.body.gst_number || 'N/A'}) has been added to the database by ${user.companyName || user.name}.`,
            sending_time: new Date().toISOString()
        });

        // Log the activity
        await logActivity(req, {
            userId: req.user.id,
            userRole: isSubMember ? 'sub-member' : 'member',
            userName: req.user.name || 'User',
            activityType: 'Report Defaulter',
            details: `Reported new defaulter: ${req.body.defaulter_name} (${req.body.gst_number || 'N/A'})`,
            parentId: organizationId
        });

        return res.status(201).json({ msg: "Defaulter reported successfully", data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error reporting defaulter" });
    }
};

exports.searchDefaulter = async (req, res) => {
    try {
        const results = await performDefaulterSearch(req.query, req.user);
        return res.status(200).json({ data: results });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error searching defaulters" });
    }
};

const performDefaulterSearch = async (filters, user) => {
    const {
        gst, pan, cin, aadhar, mobile, name,
        member_name, state, district, subDistrict,
        city, address, includePending, defaultLoad
    } = filters;

    let query = includePending === 'true'
        ? { status: { $ne: 2 } }
        : { status: 1 };

    // 🔍 MEMBER NAME SEARCH
    if (member_name) {
        const matchedUsers = await User.find({
            $or: [
                { name: { $regex: member_name, $options: "i" } },
                { companyName: { $regex: member_name, $options: "i" } }
            ]
        });

        const userIds = matchedUsers.map(u => u._id);

        if (userIds.length > 0) {
            query.user_id = { $in: userIds };
        } else {
            return [];
        }
    }

    // 🔍 BASIC FILTERS
    if (gst) query.gst_number = { $regex: gst, $options: "i" };
    if (pan) query.pan_number = { $regex: pan, $options: "i" };
    if (cin) query.cin_number = { $regex: cin, $options: "i" };
    if (aadhar) query.aadhar_number = { $regex: aadhar, $options: "i" };
    if (mobile) query.mobile_number = { $regex: mobile, $options: "i" };

    // 🔍 NAME MATCHING
    if (name) {
        const keywords = name.trim().split(/\s+/).filter(k =>
            k.length > 2 &&
            !['limited', 'private', 'pvt', 'ltd', 'company', 'corp']
                .includes(k.toLowerCase())
        );

        if (keywords.length > 0) {
            query.defaulter_name = {
                $regex: `(${[name, ...keywords]
                    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('|')})`,
                $options: "i"
            };
        } else {
            query.defaulter_name = { $regex: name, $options: "i" };
        }
    }

    // 🔍 ADDRESS MATCHING
    if (address) {
        const addrKeywords = address.trim().split(/\s+/).filter(k => k.length > 3);

        if (addrKeywords.length > 0) {
            query.defaulter_address = {
                $regex: `(${[address, ...addrKeywords]
                    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('|')})`,
                $options: "i"
            };
        } else {
            query.defaulter_address = { $regex: address, $options: "i" };
        }
    }

    if (state) query.state = state;
    if (district) query.district = district;
    if (subDistrict) query.cities = subDistrict;
    if (city) query.city = city;

    // 🔍 MAIN DB QUERY
    let reports = await DefaulterReport.find(query)
        .populate('user_id', 'name companyName')
        .sort({ createdAt: -1 });

    // 🔁 ADDRESS-BASED EXPANSION
    if (gst || pan || cin || aadhar) {
        const matchedAddresses = reports
            .map(r => r.defaulter_address)
            .filter(a => a && a.trim().length > 5);

        if (matchedAddresses.length > 0) {
            const existingIds = reports.map(r => r._id.toString());

            const relatedReports = await DefaulterReport.find({
                status: 1,
                defaulter_address: { $in: matchedAddresses },
                _id: { $nin: existingIds }
            }).populate('user_id', 'name companyName');

            if (relatedReports.length > 0) {
                reports = [...reports, ...relatedReports]
                    .sort((a, b) => b.createdAt - a.createdAt);
            }
        }
    }

    // 🌐 EXTERNAL GST FALLBACK
    if (reports.length === 0 && gst && defaultLoad !== 'true') {
        try {
            const gstApiUrl = `https://sheet.gstincheck.co.in/check/3294107c41d9191fd2857916d99d23c2/${gst}`;
            const gstResponse = await fetch(gstApiUrl);
            const gstData = await gstResponse.json();

            if (gstData && gstData.flag && gstData.data) {
                const ext = gstData.data;
                const extName = ext.tradeNam;
                const extAddress = ext.pradr?.adr;

                let orConditions = [];

                if (extName) {
                    const words = extName.trim().split(/\s+/).filter(w => w.length > 2 && !['limited', 'private', 'pvt', 'ltd', 'company', 'corp'].includes(w.toLowerCase()));
                    if (words.length > 0) orConditions.push({ defaulter_name: { $regex: words.join('|'), $options: 'i' } });
                    else orConditions.push({ defaulter_name: { $regex: extName, $options: 'i' } });
                }

                if (extAddress) {
                    const addrKeywords = extAddress.trim().split(/\s+/).filter(k => k.length > 3);
                    if (addrKeywords.length > 0) {
                        orConditions.push({ defaulter_address: { $regex: `(${[extAddress, ...addrKeywords].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, $options: "i" } });
                    } else orConditions.push({ defaulter_address: { $regex: extAddress, $options: "i" } });
                }

                const secondaryQuery = { status: 1, $or: orConditions };
                const relatedReports = await DefaulterReport.find(secondaryQuery).populate('user_id', 'name companyName').sort({ createdAt: -1 });
                reports = relatedReports.length > 0 ? relatedReports : [];
            }
        } catch (e) { console.error("External GST verification failed:", e); }
    }

    // 📝 HISTORY + NOTIFICATION
    if (defaultLoad !== 'true') {
        const historyFilters = { gst, pan, cin, aadhar, mobile, name, member_name, state, district, subDistrict, city, address };
        Object.keys(historyFilters).forEach(key => { if (!historyFilters[key]) delete historyFilters[key]; });

        await SearchHistory.create({
            user_id: user.id,
            filters: historyFilters,
            resultCount: reports.length,
            defaulter_id: reports.length > 0 ? reports[0]._id : null
        });

        if (reports.length > 0) {
            await Notification.create({
                member_id: user.id,
                message_title: "Search Results Found",
                message_content: `Your search returned ${reports.length} matching defaulter(s).`,
                sending_time: new Date().toISOString()
            });
        }

        // Mock request object for logActivity
        const mockReq = { 
            headers: {}, 
            ip: '::1', 
            socket: { remoteAddress: '::1' },
            user: user,
            protocol: 'http',
            get: (h) => ''
        };
        
        await logActivity(mockReq, {
            userId: user.id,
            userRole: user.parentId ? 'sub-member' : 'member',
            userName: user.name || 'Unknown',
            activityType: 'Defaulter Search',
            details: `Search: ${gst || pan || cin || aadhar || name || address}, Found: ${reports.length}`,
            parentId: user.parentId || user.id
        });
    }

    return reports;
};

exports.getMyReports = async (req, res) => {
    try {
        const effectiveUserId = req.user.parentId || req.user.id;
        const reports = await DefaulterReport.find({ user_id: new mongoose.Types.ObjectId(effectiveUserId) })
            .populate('user_id', 'name companyName')
            .sort({ createdAt: -1 });
        return res.status(200).json({ data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching your reports" });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.parentId || req.user.id;
        const { timeframe, card } = req.query;

        let dateFilter = {};
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (timeframe === 'today') {
            dateFilter = { createdAt: { $gte: startOfToday } };
        } else if (timeframe === 'last7days') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: sevenDaysAgo } };
        } else if (timeframe === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateFilter = { createdAt: { $gte: startOfMonth } };
        } else if (timeframe === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            dateFilter = { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } };
        }

        const statsMatch = { user_id: new mongoose.Types.ObjectId(userId), ...dateFilter };

        // Card-specific response logic
        if (card) {
            let cardData = { key: card, value: 0 };
            if (card === 'total_reported') {
                cardData.value = await DefaulterReport.countDocuments(statsMatch);
            } else if (card === 'total_amount') {
                const sum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: null, total: { $sum: "$default_amount" } } }]);
                cardData.value = sum[0]?.total || 0;
                cardData.isCurrency = true;
            } else if (card === 'total_recovered') {
                const sum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $unwind: "$payments" }, { $group: { _id: null, total: { $sum: "$payments.amount" } } }]);
                cardData.value = sum[0]?.total || 0;
                cardData.isCurrency = true;
            } else if (card === 'search_trend') {
                const startOfYear = new Date(new Date().getFullYear(), 0, 1);
                const trend = await SearchHistory.aggregate([
                    { $match: { user_id: new mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startOfYear, ...dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {} } } },
                    { $group: { _id: { month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
                    { $sort: { "_id.month": 1 } }
                ]);
                return res.status(200).json({ searchTrend: trend.map(item => ({ month: item._id.month, count: item.count })) });
            } else if (card === 'industry_dist') {
                const dist = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: "$industry", count: { $sum: 1 } } }]);
                return res.status(200).json({ industryDist: dist.map(item => ({ name: item._id || 'Uncategorized', value: item.count })) });
            }

            return res.status(200).json({ summary: { [card === 'total_reported' ? 'totalReported' : card === 'total_amount' ? 'totalAmount' : 'totalRecovered']: cardData.value }, cardData });
        }

        // Default Load - All Data
        const myReports = await DefaulterReport.find({ user_id: userId }).sort({ createdAt: -1 }).limit(5);
        const totalReported = await DefaulterReport.countDocuments(statsMatch);
        const aggregateSum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: null, total: { $sum: "$default_amount" } } }]);
        const recoveredSum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $unwind: { path: "$payments", preserveNullAndEmptyArrays: false } }, { $group: { _id: null, total: { $sum: "$payments.amount" } } }]);
        const searchHistory = await SearchHistory.find({ user_id: new mongoose.Types.ObjectId(req.user.id) }).sort({ createdAt: -1 }).limit(5);
        const recentActivities = await ActivityLog.find({ parentId: new mongoose.Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(5);
        const industryDist = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: "$industry", count: { $sum: 1 } } }]);
        const stateInsights = await DefaulterReport.aggregate([{ $match: dateFilter }, { $group: { _id: "$state", count: { $sum: 1 }, totalAmount: { $sum: "$default_amount" } } }, { $sort: { count: -1 } }]);
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const searchTrend = await SearchHistory.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(req.user.id), createdAt: { $gte: startOfYear } } },
            { $group: { _id: { month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { "_id.month": 1 } }
        ]);

        return res.status(200).json({
            summary: {
                totalReported,
                totalAmount: aggregateSum[0]?.total || 0,
                totalRecovered: recoveredSum[0]?.total || 0
            },
            statsCards: [
                { key: 'total_reported', title: 'Total Defaulters Reported', value: totalReported },
                { key: 'total_amount', title: 'Total Default Amount', value: aggregateSum[0]?.total || 0, isCurrency: true },
                { key: 'total_recovered', title: 'Total Amount Recovered', value: recoveredSum[0]?.total || 0, isCurrency: true },
                { key: 'search_trend', title: 'Search Trend', value: searchTrend.reduce((sum, item) => sum + item.count, 0) },
                { key: 'industry_dist', title: 'Industry Distribution', value: industryDist.length }
            ],
            myReports,
            recentActivities,
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
        const history = await SearchHistory.find({ user_id: new mongoose.Types.ObjectId(req.user.id) })
            .populate('user_id', 'name')
            .populate({
                path: 'defaulter_id',
                populate: { path: 'user_id', select: 'name companyName' }
            })
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
        const userId = req.user.parentId || req.user.id;
        const report = await DefaulterReport.findOne({ _id: req.params.id, user_id: userId });
        if (!report) return res.status(404).json({ msg: "Report not found or unauthorized" });

        // Check if edit window (24 hours) has expired from calculation of CREATED DATE
        const reportAdded = report.createdAt;
        const diffInHours = (Date.now() - new Date(reportAdded).getTime()) / (1000 * 60 * 60);
        if (diffInHours > 24) {
            return res.status(403).json({ msg: "The edit window for this record has expired (24 hours after creation)." });
        }

        const updateData = { ...req.body };
        if (updateData.legal_status_taken === 'true') updateData.legal_status_taken = true;
        if (updateData.legal_status_taken === 'false') updateData.legal_status_taken = false;

        if (typeof updateData.defaulter_persons === 'string') {
            try {
                updateData.defaulter_persons = JSON.parse(updateData.defaulter_persons);
            } catch (e) {
                updateData.defaulter_persons = [];
            }
        }

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
        const userId = req.user.parentId || req.user.id;
        const report = await DefaulterReport.findOne({ _id: req.params.id, user_id: userId });
        if (!report) return res.status(404).json({ msg: "Report not found or unauthorized" });
        if (report.status !== 1) {
            return res.status(403).json({ msg: "Payments cannot be added until the report is approved." });
        }

        const { payments } = req.body;
        if (!Array.isArray(payments)) {
            return res.status(400).json({ msg: "Invalid payments data" });
        }

        report.payments = [...(report.payments || []), ...payments];
        const totalPaid = report.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        report.outstanding_amount = Math.max(0, report.default_amount - totalPaid);

        await report.save();

        // Log the activity
        await logActivity(req, {
            userId: req.user.id,
            userRole: req.user.parentId ? 'sub-member' : 'member',
            userName: req.user.name || 'User',
            activityType: 'Add Payment',
            details: `Added payment of ₹${payments.reduce((sum, p) => sum + Number(p.amount), 0)} for ${report.defaulter_name}`,
            parentId: userId
        });

        return res.status(200).json({ msg: "Payment added successfully", data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error adding payment" });
    }
};

exports.getAdminDashboardStats = async (req, res) => {
    try {
        const { timeframe, card } = req.query;

        let dateFilter = {};
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (timeframe === 'today') {
            dateFilter = { createdAt: { $gte: startOfToday } };
        } else if (timeframe === 'last7days') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: sevenDaysAgo } };
        } else if (timeframe === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateFilter = { createdAt: { $gte: startOfMonth } };
        } else if (timeframe === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            dateFilter = { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } };
        }

        const statsMatch = { ...dateFilter };

        // Card-specific response logic
        if (card) {
            let cardData = { key: card, value: 0 };
            if (card === 'total_reported') {
                cardData.value = await DefaulterReport.countDocuments(statsMatch);
            } else if (card === 'total_amount') {
                const sum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: null, total: { $sum: "$default_amount" } } }]);
                cardData.value = sum[0]?.total || 0;
                cardData.isCurrency = true;
            } else if (card === 'total_recovered') {
                const sum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $unwind: "$payments" }, { $group: { _id: null, total: { $sum: "$payments.amount" } } }]);
                cardData.value = sum[0]?.total || 0;
                cardData.isCurrency = true;
            } else if (card === 'total_members') {
                cardData.value = await User.countDocuments(statsMatch);
            } else if (card === 'search_trend') {
                const startOfYear = new Date(new Date().getFullYear(), 0, 1);
                const trend = await SearchHistory.aggregate([
                    { $match: { createdAt: { $gte: startOfYear, ...dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {} } } },
                    { $group: { _id: { month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
                    { $sort: { "_id.month": 1 } }
                ]);
                return res.status(200).json({ searchTrend: trend.map(item => ({ month: item._id.month, count: item.count })) });
            } else if (card === 'industry_dist') {
                const dist = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: "$industry", count: { $sum: 1 } } }]);
                return res.status(200).json({ industryDist: dist.map(item => ({ name: item._id || 'Uncategorized', value: item.count })) });
            }

            return res.status(200).json({ summary: { [card === 'total_reported' ? 'totalReported' : card === 'total_amount' ? 'totalAmount' : card === 'total_recovered' ? 'totalRecovered' : 'totalMembers']: cardData.value }, cardData });
        }

        const industryDist = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: "$industry", count: { $sum: 1 } } }]);
        const stateInsights = await DefaulterReport.aggregate([{
            $group: {
                _id: "$state",
                count: { $sum: 1 },
                totalAmount: { $sum: "$default_amount" },
                totalRecovered: { $sum: { $subtract: ["$default_amount", { $ifNull: ["$outstanding_amount", "$default_amount"] }] } }
            }
        }]);
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const searchTrend = await SearchHistory.aggregate([{ $match: { createdAt: { $gte: startOfYear } } }, { $group: { _id: { month: { $month: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { "_id.month": 1 } }]);
        const recentReports = await DefaulterReport.find().populate('user_id', 'name companyName').sort({ createdAt: -1 }).limit(5);
        const searchHistory = await SearchHistory.find().populate('user_id', 'name companyName').sort({ createdAt: -1 }).limit(5);
        const totalMembers = await User.countDocuments();
        const totalReported = await DefaulterReport.countDocuments(statsMatch);
        const aggregateSum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $group: { _id: null, total: { $sum: "$default_amount" } } }]);
        const recoveredSum = await DefaulterReport.aggregate([{ $match: statsMatch }, { $unwind: { path: "$payments", preserveNullAndEmptyArrays: false } }, { $group: { _id: null, total: { $sum: "$payments.amount" } } }]);
        const transactions = (await require("../models/Transaction").find().populate('user_id', 'name companyName').sort({ createdAt: -1 }).limit(5)).map(tx => ({ id: tx._id, txNo: tx.txNo, member: tx.user_id?.name || 'Unknown', companyName: tx.user_id?.companyName || 'N/A', amount: tx.amount, type: tx.type }));

        return res.status(200).json({
            summary: {
                totalReported,
                totalAmount: aggregateSum[0]?.total || 0,
                totalRecovered: recoveredSum[0]?.total || 0,
                totalMembers
            },
            statsCards: [
                { key: 'total_reported', title: 'Total Defaulters Reported', value: totalReported },
                { key: 'total_amount', title: 'Total Default Amount', value: aggregateSum[0]?.total || 0, isCurrency: true },
                { key: 'total_recovered', title: 'Total Amount Recovered', value: recoveredSum[0]?.total || 0, isCurrency: true },
                { key: 'total_members', title: 'Total Members Registered', value: totalMembers },
                { key: 'search_trend', title: 'Search Trend', value: searchTrend.reduce((sum, item) => sum + item.count, 0) },
                { key: 'industry_dist', title: 'Industry Distribution', value: industryDist.length }
            ],
            industryDist: industryDist.map(item => ({ name: item._id || 'Uncategorized', value: item.count })),
            stateInsights: stateInsights.map(item => ({ state: item._id || 'N/A', count: item.count, amount: item.totalAmount, recovered: item.totalRecovered })),
            searchTrend: searchTrend.map(item => ({ month: item._id.month, count: item.count })),
            recentReports,
            searchHistory,
            transactions
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching dashboard statistics" });
    }
};

exports.adminGetAllDefaulters = async (req, res) => {
    try {
        const reports = await DefaulterReport.find().populate('user_id', 'name email companyName memberId').sort({ createdAt: -1 });
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
        const reports = await require("../models/DefaulterReport").find({ user_id: userId }).populate('user_id', 'name email companyName memberId').sort({ createdAt: -1 });
        return res.status(200).json({ msg: "Member defaulters fetched", data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Database error" });
    }
};
exports.memberApproveSubReport = async (req, res) => {
    try {
        const { reportId, status } = req.body; // 1 for approve, 2 for reject
        if (![1, 2].includes(Number(status))) {
            return res.status(400).json({ msg: "Invalid status update" });
        }

        const userId = req.user.id; // Must be primary member
        const report = await DefaulterReport.findOne({ _id: reportId, user_id: userId });

        if (!report) {
            return res.status(404).json({ msg: "Report not found or unauthorized" });
        }

        report.status = Number(status);
        await report.save();

        const action = Number(status) === 1 ? 'Approved' : 'Rejected';

        // Log the activity
        await logActivity(req, {
            userId: req.user.id,
            userRole: 'member',
            userName: req.user.name || 'Master',
            activityType: 'Status Update',
            details: `${action} sub-member report for ${report.defaulter_name}`,
            parentId: userId
        });
        return res.status(200).json({ msg: `Report ${action} successfully`, data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error processing approval" });
    }
};

exports.getActivityLogs = async (req, res) => {
    try {
        const organizationId = req.user.parentId || req.user.id;
        const logs = await ActivityLog.find({ parentId: organizationId })
            .sort({ createdAt: -1 })
            .limit(100);

        return res.status(200).json({ data: logs });
    } catch (err) {
        console.error("Error fetching logs:", err);
        return res.status(500).json({ msg: "Error fetching activity history" });
    }
};

exports.saveDownloadedReport = async (req, res) => {
    try {
        const { report_name, search_criteria } = req.body;
        const report_file = req.file ? req.file.filename : null;

        if (!report_file) {
            return res.status(400).json({ msg: "No report file uploaded" });
        }

        const newReport = new DownloadedReport({
            user_id: req.user.id,
            report_name: report_name || 'Search Report',
            report_file,
            search_criteria: search_criteria ? JSON.parse(search_criteria) : {}
        });

        await newReport.save();

        await logActivity(req, {
            userId: req.user.id,
            userRole: req.user.parentId ? 'sub-member' : 'member',
            userName: req.user.name || 'User',
            activityType: 'Download Report',
            details: `Downloaded report: ${newReport.report_name}`,
            parentId: req.user.parentId || req.user.id
        });

        return res.status(201).json({ msg: "Report saved successfully", data: newReport });
    } catch (err) {
        console.error("Error saving downloaded report:", err);
        return res.status(500).json({ msg: "Error saving downloaded report" });
    }
};

exports.getReportUrl = async (req, res) => {
    try {
        const { search_criteria } = req.body;

        const report = await DownloadedReport.findOne({
            user_id: req.user.id,
            search_criteria: search_criteria
        }).sort({ createdAt: -1 });

        if (!report) {
            return res.status(404).json({ msg: "No report found for these criteria." });
        }

        const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;
        return res.status(200).json({ downloadUrl: `${baseUrl}${report.report_file}` });
    } catch (err) {
        console.error("Error retrieving report URL:", err);
        return res.status(500).json({ msg: "Error retrieving report URL" });
    }
};

exports.generateSearchReport = async (req, res) => {
    try {
        const filters = req.body.filters || req.query;
        const results = await performDefaulterSearch(filters, req.user);
        const DownloadedReport = require("../models/DownloadedReport");

        const doc = new PDFTable({ 
            margin: 30, 
            size: 'A4', 
            layout: 'landscape',
            bufferPages: true 
        });
        
        const fileName = `Search_Report_${Date.now()}.pdf`;
        const uploadsDir = path.join(__dirname, "../uploads");
        
        // Ensure uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, fileName);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // --- Design Tokens ---
        const colors = {
            primary: "#1b5e20",
            textGray: "#646464",
            textDark: "#323232",
            watermark: "#c80000",
            white: "#ffffff",
            black: "#000000"
        };

        const memberName = req.user.name || 'N/A';
        const memberId = req.user.memberId || req.user.id.slice(-8).toUpperCase();

        // --- Helper: Add Watermark to Current Page ---
        const addWatermark = () => {
            doc.save();
            const watermarkText = `${memberName.toUpperCase()} | ID: ${memberId}`;
            doc.opacity(0.15).fillColor(colors.watermark).fontSize(14);
            
            // Draw grid of watermarks at 45 degrees
            for (let x = -100; x < 900; x += 250) {
                for (let y = -100; y < 700; y += 150) {
                    doc.save();
                    doc.translate(x, y);
                    doc.rotate(45);
                    doc.text(watermarkText, 0, 0, { lineBreak: false });
                    doc.restore();
                }
            }
            doc.restore();
        };

        // --- Header Section ---
        doc.fillColor(colors.primary).fontSize(18).text("Search Results Report", 14, 20);
        
        doc.fillColor(colors.textGray).fontSize(10);
        doc.text(`Downloaded By: ${memberName} (${memberId})`, 14, 45);
        doc.text(`Downloaded On: ${new Date().toLocaleString('en-GB', { hour12: true })}`, 14, 60);

        // --- Search Criteria Logic ---
        const getCriteriaString = (f) => {
            const parts = [];
            if (f.gst) parts.push(`GST: ${f.gst}`);
            if (f.pan) parts.push(`PAN: ${f.pan}`);
            if (f.cin) parts.push(`CIN: ${f.cin}`);
            if (f.aadhar) parts.push(`Aadhar: ${f.aadhar}`);
            if (f.mobile) parts.push(`Mobile: ${f.mobile}`);
            if (f.name) parts.push(`Company: ${f.name}`);
            if (f.address) parts.push(`Address: ${f.address}`);
            if (f.state) parts.push(`State: ${f.state}`);
            if (f.district) parts.push(`District: ${f.district}`);
            if (f.subDistrict) parts.push(`Sub-District: ${f.subDistrict}`);
            if (f.city) parts.push(`City: ${f.city}`);
            if (f.member_name) parts.push(`Member: ${f.member_name}`);
            return parts.length > 0 ? parts.join(" | ") : "All Records";
        };

        doc.fillColor(colors.textDark).fontSize(9).text(`Search Criteria: ${getCriteriaString(filters)}`, 14, 75, { width: 770 });

        // --- Table Data Preparation ---
        const tableData = results.length > 0 ? results.map((def, idx) => {
            const recoveryAmt = (def.payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
            const outstanding = Number(def.outstanding_amount === undefined ? def.default_amount : def.outstanding_amount);
            const status = (def.isSettled || outstanding === 0) ? 'CLEARED' : 'DEFAULTER';
            
            let paymentStatus = 'Not Paid';
            const defaultAmt = Number(def.default_amount) || 0;
            if (def.isSettled) paymentStatus = 'Settled';
            else if (outstanding === 0) paymentStatus = 'Full Paid';
            else if (outstanding > 0 && outstanding < defaultAmt) paymentStatus = 'Partial Paid';

            return [
                (idx + 1).toString(),
                def.user_id?.name || 'N/A',
                def.user_id?.companyName || 'N/A',
                def.defaulter_name || '-',
                def.defaulter_address || '-',
                def.gst_number || '-',
                def.cin_number || '-',
                (def.defaulter_persons || []).length.toString(),
                `${def.state || '-'}\n${def.district || '-'}\n${def.cities || def.sub_district || '-'}\n${def.city || '-'}`,
                `Rs. ${Number(def.default_amount).toLocaleString('en-IN')}`,
                `Rs. ${Number(outstanding).toLocaleString('en-IN')}`,
                `Rs. ${Number(recoveryAmt).toLocaleString('en-IN')}`,
                paymentStatus,
                status
            ];
        }) : [["-", "No Record Found", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]];

        const headers = [
            { label: "Sr.", property: "0", width: 20, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Reported By (Member)", property: "1", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Reported By (Company)", property: "2", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Defaulter Company", property: "3", width: 65, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Address", property: "4", width: 80, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "GST", property: "5", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "CIN", property: "6", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Persons", property: "7", width: 25, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Location (State, Dist, SubDist, City)", property: "8", width: 85, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Default Amount", property: "9", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Outstanding Amt", property: "10", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Recovery Amt", property: "11", width: 55, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Pymt Status", property: "12", width: 45, headerColor: colors.primary, headerOpacity: 1, color: colors.white },
            { label: "Status", property: "13", width: 45, headerColor: colors.primary, headerOpacity: 1, color: colors.white }
        ];

        const datas = tableData.map(row => {
            const obj = {};
            row.forEach((cell, idx) => { obj[idx.toString()] = cell; });
            return obj;
        });

        const table = { headers, datas };

        // --- Draw Table ---
        await doc.table(table, {
            prepareHeader: () => doc.font("Helvetica-Bold").fontSize(6).fillColor(colors.white),
            prepareRow: () => doc.font("Helvetica").fontSize(6).fillColor(colors.black),
            padding: 2,
            columnSpacing: 5,
            x: 14,
            y: 100, 
            width: 780,
            divider: {
                header: { disabled: false, width: 0.5, opacity: 1, color: colors.white },
                horizontal: { disabled: false, width: 0.1, opacity: 0.2 }
            }
        });

        // --- Post-Processing (Watermark & Footer) ---
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            
            // Watermark (Darker as requested: opacity 0.25)
            doc.save();
            const watermarkText = `${memberName.toUpperCase()} | ID: ${memberId}`;
            doc.opacity(0.25).fillColor(colors.watermark).fontSize(14);
            
            for (let x = -100; x < 900; x += 300) {
                for (let y = -100; y < 700; y += 150) {
                    doc.save();
                    doc.translate(x, y);
                    doc.rotate(45); 
                    doc.text(watermarkText, 0, 0, { lineBreak: false });
                    doc.restore();
                }
            }
            doc.restore();

            // Footer (Page Number)
            doc.opacity(1).fillColor(colors.textGray).fontSize(8);
            doc.text(`${i + 1}`, 780, 560, { align: 'right' });
        }

        doc.end();

        writeStream.on('finish', async () => {
            const newReport = new DownloadedReport({
                user_id: req.user.id,
                report_name: fileName,
                report_file: fileName,
                search_criteria: filters
            });
            await newReport.save();

            const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;
            return res.status(200).json({ downloadUrl: `${baseUrl}${fileName}` });
        });

    } catch (err) {
        console.error("Report Generation Error:", err);
        return res.status(500).json({ msg: "Error generating report" });
    }
};

exports.adminGetActivityLogs = async (req, res) => {
    try {
        const logsData = await ActivityLog.aggregate([
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    _id: 1,
                    userId: 1,
                    userRole: 1,
                    userName: 1,
                    activityType: 1,
                    details: 1,
                    ipAddress: 1,
                    parentId: 1,
                    createdAt: 1,
                    memberId: { $ifNull: ["$userDetails.memberId", "ADMIN"] },
                    companyName: { $ifNull: ["$userDetails.companyName", "System"] }
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1000 }
        ]);

        return res.status(200).json({ data: logsData });
    } catch (err) {
        console.error("Error fetching admin logs:", err);
        return res.status(500).json({ msg: "Error fetching admin activity history" });
    }
};

exports.settleReport = async (req, res) => {
    try {
        const userId = req.user.parentId || req.user.id;
        const report = await DefaulterReport.findOne({ _id: req.params.id, user_id: userId });
        if (!report) return res.status(404).json({ msg: "Report not found or unauthorized" });

        const { settledAmount, settledBy, settlementDate } = req.body;

        report.isSettled = true;
        report.settledAmount = Number(settledAmount);
        report.settledBy = settledBy;
        report.settlementDate = new Date(settlementDate);

        // Add a settlement payment to the payments array
        report.payments.push({
            amount: Number(settledAmount),
            date: new Date(settlementDate),
            type: 'settlement'
        });

        await report.save();

        // Use a fresh calculation for outstanding instead of forcing zero
        const totalPaid = report.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        report.outstanding_amount = Math.max(0, report.default_amount - totalPaid);
        await report.save();

        await logActivity(req, {
            userId: req.user.id,
            userRole: req.user.parentId ? 'sub-member' : 'member',
            userName: req.user.name || 'User',
            activityType: 'Settle Defaulter',
            details: `Settled record for ${report.defaulter_name} at ₹${settledAmount}`,
            parentId: userId
        });

        return res.status(200).json({ msg: "Record settled successfully", data: report });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error settling report" });
    }
};

exports.getDefaulterById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ msg: "Defaulter ID is required" });
        }

        const defaulter = await DefaulterReport.findById(id)
            .populate('user_id', 'name companyName email memberId phone')
            .populate('reported_by_id', 'name email phone');

        if (!defaulter) {
            return res.status(404).json({ msg: "Defaulter not found" });
        }

        // Check if user has access to this defaulter
        // Admin can see all, members can see their own reports

        return res.status(200).json({
            msg: "Defaulter details fetched successfully",
            data: defaulter
        });
    } catch (err) {
        console.error("Error fetching defaulter details:", err);
        return res.status(500).json({ msg: "Error fetching defaulter details" });
    }
};

exports.logLogout = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ msg: "Unauthorized" });

        await logActivity(req, {
            userId: req.user.id,
            userRole: req.user.parentId ? 'sub-member' : 'member',
            userName: req.user.name || 'User',
            activityType: 'System Logout',
            details: `User logged out`,
            parentId: req.user.parentId || req.user.id
        });

        return res.status(200).json({ msg: "Logout logged" });
    } catch (error) {
        return res.status(500).json({ msg: "Error logging logout" });
    }
};
