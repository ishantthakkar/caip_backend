require('dotenv').config();
const mongoose = require('mongoose');
const { MONGO_URI } = require('./config/config');
const { runImport } = require('./services/excelImportService');

async function main() {
    await mongoose.connect(MONGO_URI);
    const result = await runImport();
    console.log(JSON.stringify(result, null, 2));
    await mongoose.disconnect();
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
