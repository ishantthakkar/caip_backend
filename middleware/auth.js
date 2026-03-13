const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/config");

const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token provided" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // If parentId is not in token (legacy or first login), try to fetch it
        if (!req.user.parentId) {
            const SubMember = require("../models/SubMember");
            const sub = await SubMember.findById(req.user.id);
            if (sub && sub.parentId) {
                req.user.parentId = sub.parentId.toString();
            }
        }
        
        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({ msg: "Invalid token" });
    }
};

module.exports = verifyToken;
