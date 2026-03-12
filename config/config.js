module.exports = {
    JWT_SECRET: process.env.JWT_SECRET || "your_jwt_secret_key",
    MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/caip",
    PORT: process.env.PORT || 5000
};
