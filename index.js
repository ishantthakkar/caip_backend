require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");
const { PORT } = require("./config/config");

// Initialize app
const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Use Routes
app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", membershipRoutes);
app.use("/api", defaulterRoutes);
app.use("/api", locationRoutes);

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;