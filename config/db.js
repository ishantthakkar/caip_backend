const mongoose = require("mongoose");
const { MONGO_URI } = require("./config");

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        console.log("Using existing database connection");
        return;
    }

    try {
        const db = await mongoose.connect(MONGO_URI);
        isConnected = db.connections[0].readyState;
        console.log("Mongo connected");
    } catch (err) {
        console.error("Mongo connection failed", err);
        // Don't exit process in serverless!
    }
};

module.exports = connectDB;
