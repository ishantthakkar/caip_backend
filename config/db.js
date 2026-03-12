const mongoose = require("mongoose");
const { MONGO_URI } = require("./config");

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Mongo connected");
    } catch (err) {
        console.error("Mongo connection failed", err);
        process.exit(1);
    }
};

module.exports = connectDB;
