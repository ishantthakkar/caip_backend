const mongoose = require("mongoose");
const User = require("../models/User");
const DefaulterReport = require("../models/DefaulterReport");
const SearchHistory = require("../models/SearchHistory");
const ActivityLog = require("../models/ActivityLog");
const logActivity = require("../middleware/activityLogger");
const Notification = require("../models/Notification");
const emailService = require("../utils/emailService");

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
        const { gst, pan, cin, aadhar, mobile, name, member_name, state, district, subDistrict, city, address, includePending, defaultLoad } = req.query;
        let query = includePending === 'true' ? { status: { $ne: 2 } } : { status: 1 };

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
                return res.status(200).json({ data: [] });
            }
        }

        if (gst) query.gst_number = { $regex: gst, $options: "i" };
        if (pan) query.pan_number = { $regex: pan, $options: "i" };
        if (cin) query.cin_number = { $regex: cin, $options: "i" };
        if (aadhar) query.aadhar_number = { $regex: aadhar, $options: "i" };
        if (mobile) query.mobile_number = { $regex: mobile, $options: "i" };
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
        if (city) query.city = city;
        let reportsQuery = DefaulterReport.find(query).populate('user_id', 'name companyName').sort({ createdAt: -1 });

        let reports = await reportsQuery;

        // Enhanced: if identifier search finds a record, also fetch other records sharing the same address
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
                    reports = [...reports, ...relatedReports].sort((a, b) => b.createdAt - a.createdAt);
                }
            }
        }

        // Fallback to external GST verification if no results found in local DB and GST was entered
        let externalData = null;
        if (reports.length === 0 && gst && defaultLoad !== 'true') {
            try {
                const gstApiUrl = `https://sheet.gstincheck.co.in/check/3294107c41d9191fd2857916d99d23c2/${gst}`;
                const gstResponse = await fetch(gstApiUrl);
                const gstData = await gstResponse.json();

                if (gstData && gstData.flag && gstData.data) {
                    const ext = gstData.data;
                    externalData = {
                        _id: `ext_${Date.now()}`,
                        isExternal: true,
                        defaulter_name: ext.lgnm || ext.tradeNam || 'N/A',
                        gst_number: gst,
                        pan_number: gst.substring(2, 12).toUpperCase(),
                        defaulter_address: ext.pradr?.adr || 'N/A',
                        state: ext.pradr?.addr?.stcd || 'N/A',
                        district: ext.pradr?.addr?.dst || 'N/A',
                        cities: ext.pradr?.addr?.st || 'N/A',
                        city: ext.pradr?.addr?.loc || 'N/A',
                        default_amount: 0,
                        outstanding_amount: 0,
                        payments: [],
                        user_id: { name: 'GST Public Records', companyName: 'Verified' }
                    };
                    reports = [externalData];
                }
            } catch (e) {
                console.error("Backend External GST verification failed:", e);
            }
        }

        let historyFilters = { gst, pan, cin, aadhar, mobile, name, member_name, state, district, subDistrict, city, address };
        // Clean undefined/empty filters
        Object.keys(historyFilters).forEach(key => {
            if (historyFilters[key] === undefined || historyFilters[key] === '' || historyFilters[key] === null) {
                delete historyFilters[key];
            }
        });
        let resultData = null;
        if (reports.length > 0) {
            const first = reports[0];
            resultData = {
                name: first.defaulter_name,
                gst: first.gst_number,
                pan: first.pan_number,
                cin: first.cin_number,
                aadhar: first.aadhar_number,
                state: first.state,
                district: first.district,
                subDistrict: first.cities,
                city: first.city,
                address: first.defaulter_address,
                email: first.email_id,
                mobile: first.mobile_number,
                industry: first.industry,
                financial_year: first.financial_year,
                default_amount: first.default_amount,
                outstanding_amount: first.outstanding_amount,
                date_of_default: first.date_of_default,
                reason: first.reason_description,
                payment_records: first.payments,
                isExternal: first.isExternal || false,
                reported_by: first.user_id?.companyName || 'Verified Member'
            };
        }

        // Only create history and notifications if it's an actual user search (not a default page load)
        if (defaultLoad !== 'true') {
            const searchRecord = await SearchHistory.create({
                user_id: req.user.id, // History is still personal
                filters: historyFilters,
                resultData: resultData,
                resultCount: reports.length
            });

            // Notify user about search result (only if they found something)
            if (reports.length > 0) {
                await Notification.create({
                    member_id: req.user.id,
                    message_title: "Search Results Found",
                    message_content: `Your search returned ${reports.length} matching defaulter(s) in the database.`,
                    sending_time: new Date().toISOString()
                });
            }

            // Log clinical activity
            await logActivity(req, {
                userId: req.user.id,
                userRole: req.user.parentId ? 'sub-member' : 'member',
                userName: req.user.name || 'Unknown',
                activityType: 'Defaulter Search',
                details: `Searched for: ${gst || pan || cin || aadhar || name || address}. Records found: ${reports.length}`,
                parentId: req.user.parentId || req.user.id
            });
        }

        return res.status(200).json({ data: reports });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error searching defaulters" });
    }
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
