const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_SECRET } = require("../config/config");

exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, state, district, subDistrict, gst, pan, role, companyName } = req.body;
        const businessDocument = req.file ? req.file.filename : null;

        if (!name || !email || !password || !phone || !state || !district || !subDistrict) {
            return res.status(400).json({ msg: "Required fields are missing" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ msg: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

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
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ msg: "All fields are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }

        if (user.status === "0" || user.status === 0) {
            return res.status(403).json({ msg: "Approval pending" });
        } else if (user.status === "2" || user.status === 2) {
            return res.status(403).json({ msg: "Your account has been deactivated. Please contact admin." });
        }

        if (user.status !== "1" && user.status !== 1) {
            return res.status(403).json({ msg: "Account not active" });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        user.token = token;
        await user.save();

        return res.status(200).json({
            msg: "Login successful",
            token: token,
            user: user
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Internal server error", error: err.message });
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
