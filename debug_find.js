const mongoose = require('mongoose');
const DefaulterReport = require('./models/DefaulterReport');
require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/caip";

async function test() {
    await mongoose.connect(MONGO_URI);
    const parentIdStr = "69b3e7b4d89eb4ce0c43c3f2";
    
    // Testing with string
    const reportsStr = await DefaulterReport.find({ user_id: parentIdStr });
    console.log(`Reports found with string ID:`, reportsStr.length);

    // Testing with ObjectId
    const reportsObj = await DefaulterReport.find({ user_id: new mongoose.Types.ObjectId(parentIdStr) });
    console.log(`Reports found with ObjectId:`, reportsObj.length);

    await mongoose.connection.close();
}
test();
