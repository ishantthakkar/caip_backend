require('dotenv').config();

const mongoUrl = process.env.ME_CONFIG_MONGODB_URL || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/';

module.exports = {
  mongodb: {
    connectionString: mongoUrl,
    admin: true,
  },
  site: {
    baseUrl: '/',
    port: Number(process.env.ME_CONFIG_PORT || 8081),
    cookieSecret: process.env.ME_CONFIG_COOKIE_SECRET || 'caip-mongo-express',
    requestSizeLimit: '50mb',
  },
  basicAuth: {
    username: process.env.ME_CONFIG_BASICAUTH_USERNAME || 'admin',
    password: process.env.ME_CONFIG_BASICAUTH_PASSWORD || 'admin123',
  },
  options: {
    documentsPerPage: 20,
    editor: 'default',
    maxPropSize: 250000,
    maxRowSize: 250000,
  },
};
