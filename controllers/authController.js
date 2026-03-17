const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SubMember = require("../models/SubMember");
const { JWT_SECRET } = require("../config/config");
const logActivity = require("../middleware/activityLogger");

exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, state, district, subDistrict, gst, pan, role, companyName } = req.body;
        const businessDocument = req.file ? req.file.filename : null;

        if (!name || !email || !phone || !state || !district || !subDistrict) {
            return res.status(400).json({ msg: "Required fields are missing" });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ msg: "Email already exists" });

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) return res.status(400).json({ msg: "Phone number already exists" });

        var hashedPassword = "";
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const count = await User.countDocuments();
        const memberId = `CAIP${String(count + 1).padStart(5, '0')}`;

        const result = await User.create({
            name,
            email,
            password: hashedPassword,
            phone,
            state,
            district,
            subDistrict,
            businessDocument,
            gst: gst || "",
            pan: pan || "",
            companyName: companyName || "",
            role: 2,
            status: 0,
            membership_status: 0,
            memberId: memberId
        });

        return res.status(201).json({ msg: "Success created", userId: result._id, data: result });
    } catch (err) {
        console.error("Register Error:", err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
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
                return res.status(403).json({ msg: "Approval pending. Please contact admin." });
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

        // In a real scenario, we would send an SMS here. 
        // For now, we use static OTP: 123456
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
            // For sub-members, also verify the parent account is approved
            const parent = await User.findById(user.parentId);
            if (!parent || (parent.status !== "1" && parent.status !== 1)) {
                return res.status(403).json({ msg: "Parent account not approved or deactivated." });
            }
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, name: isSubMember ? user.firstName : user.name, parentId: isSubMember ? user.parentId : null },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        user.token = token;
        await user.save();

        // Log the activity
        await logActivity(req, {
            userId: user._id,
            userRole: isSubMember ? 'sub-member' : 'member',
            userName: isSubMember ? user.firstName : user.name,
            activityType: 'System Login',
            details: `Logged in from IP: ${req.ip} at ${new Date().toLocaleTimeString()}`,
            parentId: isSubMember ? user.parentId : user._id
        });

        if (isSubMember) {
            // For sub-members, we need to return the parent's info but keep track that it's a sub-user
            const parent = await User.findById(user.parentId);
            return res.status(200).json({
                msg: "Login successful (Sub-Member)",
                token: token,
                user: parent,
                subMember: user
            });
        }

        return res.status(200).json({
            msg: "Login successful",
            token: token,
            user: user
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

        const user = await User.findOne({ email, role: 1 });
        if (!user) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        user.token = token;
        await user.save();

        // Log the activity
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
