const connectDB = require("../config/db");

const dbMiddleware = async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("Database connection error in middleware:", error);
        res.status(500).json({ msg: "Database connection failed" });
    }
};

module.exports = dbMiddleware;
