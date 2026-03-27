module.exports = {
    JWT_SECRET: process.env.JWT_SECRET || "your_jwt_secret_key",
    MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/caip",
    PORT: process.env.PORT || 5000,
    SMTP: {
        HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
        PORT: process.env.SMTP_PORT || 465,
        USER: process.env.SMTP_USER || '',
        PASS: process.env.SMTP_PASS || '',
        ADMIN: process.env.ADMIN_EMAIL || ''
    }
};
