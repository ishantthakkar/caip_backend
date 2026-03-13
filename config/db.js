const mongoose = require("mongoose");
const { MONGO_URI } = require("./config");

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        return;
    }

    try {
        const db = await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of default 30s
        });
        isConnected = db.connections[0].readyState;
        console.log("Mongo connected successfully");
    } catch (err) {
        console.error("Critical: Mongo connection failed", err.message);
        throw err;
    }
};

module.exports = connectDB;
