require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");
const { PORT } = require("./config/config");

// Initialize app
const app = express();

// Increase payload limits for large document uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware
const dbMiddleware = require("./middleware/dbMiddleware");
app.use(dbMiddleware);
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Root and Health Check
app.get("/", (req, res) => res.send("CAIP Backend API is running..."));
app.get("/health", (req, res) => res.json({ status: "healthy", timestamp: new Date() }));

// Import Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const membershipRoutes = require("./routes/membershipRoutes");
const defaulterRoutes = require("./routes/defaulterRoutes");
const locationRoutes = require("./routes/locationRoutes");
const subMemberRoutes = require("./routes/subMemberRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const termsRoutes = require("./routes/termsRoutes");

// Use Routes
app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", membershipRoutes);
app.use("/api", defaulterRoutes);
app.use("/api", locationRoutes);
app.use("/api", notificationRoutes);
app.use("/api", termsRoutes);
app.use("/api/sub-members", subMemberRoutes);

// Global Error Handler - Convert HTML errors to JSON for easier debugging
app.use((err, req, res, next) => {
    console.error("Critical System Error:", err);
    res.status(500).json({
        msg: "A critical server error occurred.",
        error: err.message,
        path: req.path
    });
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;