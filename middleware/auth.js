const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/config");

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token provided" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({ msg: "Invalid token" });
    }
};

module.exports = verifyToken;
