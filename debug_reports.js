const mongoose = require('mongoose');
const User = require('./models/User');
const SubMember = require('./models/SubMember');
const DefaulterReport = require('./models/DefaulterReport');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/caip";

async function test() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    const subMembers = await SubMember.find();
    console.log("Sub-Members found:", subMembers.length);

    for (const sm of subMembers) {
        console.log(`Sub-Member: ${sm.firstName}, Parent: ${sm.parentId}`);
        const reports = await DefaulterReport.find({ user_id: sm.parentId });
        console.log(`Reports found for parent ${sm.parentId}:`, reports.length);
    }

    const allReports = await DefaulterReport.find().limit(5);
    console.log("Sample Reports:", allReports.map(r => ({ name: r.defaulter_name, user_id: r.user_id })));

    await mongoose.connection.close();
}

test().catch(err => {
    console.error(err);
    mongoose.connection.close();
});
