const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SubMember = require("../models/SubMember");
const Notification = require("../models/Notification");
const { JWT_SECRET, JWT_REFRESH_SECRET } = require("../config/config");
const TermsCondition = require("../models/TermsCondition");
const logActivity = require("../middleware/activityLogger");
const emailService = require("../utils/emailService");

const createAccessToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });
const createRefreshToken = (payload) => jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "10m" });

exports.register = async (req, res) => {
    try {
        console.log("Registration process started for:", req.body.email || "unknown");

        let { name, email, password, phone, state, district, subDistrict, city, gst, pan, aadhar, role, companyName, businessAddress, industry, companyEmail, alternateContactNumber, pinCode, otp, businessType, yearsInBusiness, cinNumber, companyPhoneNumber } = req.body;

        // Correct file mapping for upload.fields
        const businessDocuments = req.files && req.files.businessDocuments
            ? req.files.businessDocuments.map(file => file.filename)
            : [];

        if (!name || !email || !phone || !state || !district || !subDistrict || !industry || !otp || !businessAddress || !pinCode) {
            console.warn("Registration validation failed: Missing mandatory fields");
            return res.status(400).json({ msg: "Required fields are missing: Name, Email, Phone, State, District, Sub-District, Industry, OTP, Pincode, and Business Address are mandatory." });
        }

        if (otp !== "123456") {
            return res.status(400).json({ msg: "Invalid OTP" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const trimmedPhone = phone.toString().trim();

        // Database checks
        const existingEmail = await User.findOne({ email: normalizedEmail });
        if (existingEmail) return res.status(400).json({ msg: "A user with this email address already exists." });

        const existingPhone = await User.findOne({ phone: trimmedPhone });
        if (existingPhone) return res.status(400).json({ msg: "A user with this phone number already exists." });

        // Hash management
        let hashedPassword = "";
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        } else {
            hashedPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
        }

        // Member ID calculation
        const count = await User.countDocuments();
        const memberId = `CAIP${String(count + 1).padStart(5, '0')}`;

        // Find current published terms
        const publishedTerms = await TermsCondition.findOne({ status: "Published" });

        // Create User
        const result = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            phone: trimmedPhone,
            state,
            district,
            subDistrict,
            city: city || "",
            businessDocuments,
            gst: gst || "",
            pan: pan || "",
            aadhar: aadhar || "",
            companyName: companyName || "",
            businessAddress: businessAddress || "",
            industry: industry || "",
            companyEmail: companyEmail || "",
            alternateContactNumber: alternateContactNumber || "",
            pinCode: pinCode || "",
            businessType: businessType || "",
            yearsInBusiness: yearsInBusiness || "",
            cinNumber: cinNumber || "",
            companyPhoneNumber: companyPhoneNumber || "",
            role: "2",
            status: "0",
            membership_status: "0",
            memberId: memberId,
            acceptedTermsId: publishedTerms ? publishedTerms._id : null
        });

        console.log(`Success: Registered user ${memberId} - ${normalizedEmail}`);

        // --- Email Notifications ---
        const memberData = { name: name.trim(), email: normalizedEmail, memberId, companyName, phone: trimmedPhone };
        emailService.sendRegistrationEmail(memberData); // Fire-and-forget for registration email
        emailService.notifyAdminOnRegistration(memberData); // Notify admin by email too

        // Notify Admin (Internal Database Notification)
        try {
            await Notification.create({
                member_id: 'Admin',
                message_title: "New Member Alert",
                message_content: `Registration received from ${companyName || name} (ID: ${memberId}). Please verify documents.`,
                sending_time: new Date().toISOString()
            });
        } catch (notifErr) {
            console.error("Non-fatal: Admin notification failed during registration:", notifErr);
        }

        return res.status(201).json({
            msg: "Registration successful! Your portal access is pending admin verification.",
            userId: result._id,
            data: {
                id: result._id,
                name: result.name,
                email: result.email,
                memberId: result.memberId
            }
        });

    } catch (err) {
        console.error("Critical Registration Failure:", err);
        return res.status(500).json({
            msg: "Registration system encountered a problem.",
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};

exports.sendRegisterOtp = async (req, res) => {
    try {
        const { email, phone } = req.body;

        if (!email || !phone) {
            return res.status(400).json({ msg: "Email and phone are required to send OTP." });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const trimmedPhone = phone.toString().trim();

        const existingEmail = await User.findOne({ email: normalizedEmail });
        if (existingEmail) return res.status(400).json({ msg: "Email already exists" });

        const existingPhone = await User.findOne({ phone: trimmedPhone });
        if (existingPhone) return res.status(400).json({ msg: "Phone number already exists" });

        // Static OTP for now
        return res.status(200).json({ msg: "OTP sent successfully", status: "otp_sent" });
    } catch (err) {
        console.error("sendRegisterOtp validation error:", err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};

exports.login = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ msg: "Mobile number is required" });
        }

        let user = await User.findOne({ phone, role: "2" });
        let isSubMember = false;

        if (!user) {
            user = await SubMember.findOne({ phone });
            if (!user) {
                return res.status(404).json({ msg: "User/Sub-Member not found" });
            }
            if (!user.isActive) {
                return res.status(403).json({ msg: "Sub-Member access is currently disabled by admin." });
            }
            isSubMember = true;
        }

        if (!isSubMember) {
            if (user.status === "0" || user.status === 0) {
                return res.status(403).json({ msg: "Membership request is currently awaiting admin approval." });
            } else if (user.status === "2" || user.status === 2) {
                const reason = user.rejectionReason ? ` Reason: ${user.rejectionReason}` : "";
                return res.status(403).json({ msg: `Your account has been rejected.${reason}` });
            }
        } else {
            const parent = await User.findById(user.parentId);
            if (!parent || parent.status === "0" || parent.status === 0) {
                return res.status(403).json({ msg: "Parent account approval pending." });
            } else if (parent.status === "2" || parent.status === 2) {
                return res.status(403).json({ msg: "Parent account has been rejected or deactivated." });
            }
        }

        // OTP static 123456
        return res.status(200).json({ msg: "OTP sent successfully", status: "otp_sent" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        if (otp !== "123456") {
            return res.status(400).json({ msg: "Invalid OTP" });
        }

        let user = await User.findOne({ phone, role: "2" });
        let isSubMember = false;

        const { device_token, deviceToken } = req.body;
        const resolvedDeviceToken = device_token || deviceToken || null;

        if (!user) {
            user = await SubMember.findOne({ phone });
            if (!user) {
                return res.status(404).json({ msg: "User not found" });
            }
            if (!user.isActive) {
                return res.status(403).json({ msg: "Sub-Member access is disabled." });
            }
            isSubMember = true;
        }

        if (!isSubMember) {
            if (user.status !== "1" && user.status !== 1) {
                return res.status(403).json({ msg: "Account not approved" });
            }
        } else {
            const parent = await User.findById(user.parentId);
            if (!parent || (parent.status !== "1" && parent.status !== 1)) {
                return res.status(403).json({ msg: "Parent account not approved or deactivated." });
            }
        }

        if (resolvedDeviceToken) {
            user.deviceToken = resolvedDeviceToken;
        }

        const payload = {
            id: user._id,
            email: user.email,
            name: isSubMember ? user.firstName : user.name,
            parentId: isSubMember ? user.parentId : null
        };

        const accessToken = createAccessToken(payload);
        const refreshToken = createRefreshToken(payload);

        user.token = accessToken;
        user.refreshToken = refreshToken;
        await user.save();

        await logActivity(req, {
            userId: user._id,
            userRole: isSubMember ? 'sub-member' : 'member',
            userName: isSubMember ? user.firstName : user.name,
            activityType: 'System Login',
            details: `Logged in from IP: ${req.ip} at ${new Date().toLocaleTimeString()}`,
            parentId: isSubMember ? user.parentId : user._id
        });

        if (isSubMember) {
            const parent = await User.findById(user.parentId);
            return res.status(200).json({
                msg: "Login successful (Sub-Member)",
                access_token: accessToken,
                refresh_token: refreshToken,
                token: accessToken,
                user: parent,
                subMember: user
            });
        }

        return res.status(200).json({
            msg: "Login successful",
            access_token: accessToken,
            refresh_token: refreshToken,
            user: user
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};

exports.refreshToken = async (req, res) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return res.status(400).json({ msg: "Refresh token is required" });
        }

        let payload;
        try {
            payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ msg: "Refresh token expired" });
            }
            return res.status(401).json({ msg: "Invalid refresh token" });
        }

        let user = await User.findById(payload.id);
        let isSubMember = false;

        if (!user) {
            user = await SubMember.findById(payload.id);
            if (!user) {
                return res.status(404).json({ msg: "User not found" });
            }
            isSubMember = true;
        }

        if (!user.refreshToken || user.refreshToken !== refresh_token) {
            return res.status(403).json({ msg: "Refresh token is not valid" });
        }

        const accessPayload = {
            id: user._id,
            email: user.email,
            name: isSubMember ? user.firstName : user.name,
            parentId: isSubMember ? user.parentId : null
        };

        const accessToken = createAccessToken(accessPayload);
        user.token = accessToken;
        await user.save();

        return res.status(200).json({
            msg: "Access token refreshed successfully",
            access_token: accessToken
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};

exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        const user = await User.findOne({ email, role: { $in: ["1", 1] } });
        if (!user) {
            return res.status(400).json({ msg: "Invalid credentials (Admin check failed)" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        user.token = token;
        await user.save();

        await logActivity(req, {
            userId: user._id,
            userRole: 'admin',
            userName: user.name,
            activityType: 'System Login',
            details: `Logged in from IP: ${req.ip} at ${new Date().toLocaleTimeString()}`,
            parentId: null
        });

        return res.status(200).json({
            msg: "Login successful",
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
    }
};

exports.verifyGst = async (req, res) => {
    try {
        const { gst } = req.params;
        if (!gst) {
            return res.status(400).json({ msg: "GST number is required" });
        }

        const apiUrl = `https://sheet.gstincheck.co.in/check/ecf57ae07da1c5e3ecbbae1048670ec5/${gst}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.flag) {
            return res.status(200).json({ msg: "GST found", data: data.data });
        } else {
            return res.status(400).json({ msg: data.message || "Invalid GST number" });
        }
    } catch (err) {
        console.error("GST verification error:", err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};
exports.acceptTerms = async (req, res) => {
    try {
        const { userId, termsId } = req.body;
        if (!userId || !termsId) {
            return res.status(400).json({ msg: "User ID and Terms ID are required" });
        }
        await User.findByIdAndUpdate(userId, { acceptedTermsId: termsId });
        return res.status(200).json({ msg: "Terms accepted successfully" });
    } catch (err) {
        console.error("Error accepting terms:", err);
        return res.status(500).json({ msg: "Internal server error" });
    }
};

exports.updateDeviceToken = async (req, res) => {
    try {
        const userId = req.user?.id;
        const deviceToken = req.body.device_token || req.body.deviceToken;

        if (!userId) {
            return res.status(401).json({ msg: "Unauthorized" });
        }
        if (!deviceToken) {
            return res.status(400).json({ msg: "device_token is required" });
        }

        // Remove this token from any other user/sub-member so it stays unique.
        await User.updateMany({ deviceToken: deviceToken, _id: { $ne: userId } }, { deviceToken: null });
        await SubMember.updateMany({ deviceToken: deviceToken, _id: { $ne: userId } }, { deviceToken: null });

        let user = await User.findById(userId);
        let isSubMember = false;
        if (!user) {
            user = await SubMember.findById(userId);
            if (!user) {
                return res.status(404).json({ msg: "User not found" });
            }
            isSubMember = true;
        }

        user.deviceToken = deviceToken;
        await user.save();

        return res.status(200).json({ msg: "Device token updated successfully", device_token: deviceToken });
    } catch (err) {
        console.error("Update device token error:", err);
        return res.status(500).json({ msg: "Unable to update device token" });
    }
};

exports.logout = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        let user = await User.findById(userId);
        let isSubMember = false;
        if (!user) {
            user = await SubMember.findById(userId);
            if (!user) {
                return res.status(404).json({ msg: "User not found" });
            }
            isSubMember = true;
        }

        user.deviceToken = null;
        user.token = null;
        user.refreshToken = null;
        await user.save();

        await logActivity(req, {
            userId: user._id,
            userRole: isSubMember ? 'sub-member' : 'member',
            userName: isSubMember ? user.firstName : user.name,
            activityType: 'System Logout',
            details: 'User logged out and device token cleared',
            parentId: isSubMember ? user.parentId : user._id
        });

        return res.status(200).json({ msg: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ msg: "Logout failed" });
    }
};
