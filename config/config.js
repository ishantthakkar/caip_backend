module.exports = {
    JWT_SECRET: process.env.JWT_SECRET || "your_jwt_secret_key",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "your_jwt_refresh_secret_key",
    MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/caip",
    PORT: process.env.PORT || 5000,
    GST_API_KEY: process.env.GST_API_KEY || "gak_f3ba65ac7f684019b074d43c30fd6a9c",
    SMTP: {
        HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
        PORT: process.env.SMTP_PORT || 465,
        USER: process.env.SMTP_USER || '',
        PASS: process.env.SMTP_PASS || '',
        ADMIN: process.env.ADMIN_EMAIL || ''
    }
};
