require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const DefaulterReport = require('./models/DefaulterReport');
const { MONGO_URI } = require('./config/config');

async function seedDefaulters() {
    try {
        await mongoose.connect('mongodb://localhost:27017/caip');
        console.log('Connected to Local MongoDB');

        // Target specific user ID
        const targetUserId = '69cf56b7acaf2a2a460ca747';
        const user = await User.findById(targetUserId);

        if (!user) {
            console.warn(`User with ID ${targetUserId} not found. Using generic IDs for associations.`);
        }

        const effectiveUserId = user ? user._id : new mongoose.Types.ObjectId(targetUserId);
        const name = user ? user.name : 'Target User';
        console.log(`Using user ID: ${effectiveUserId} (${name}) for reports.`);

        const states = ["Gujarat", "Maharashtra", "Rajasthan", "Delhi", "Karnataka"];
        const districts = ["Ahmedabad", "Mumbai", "Jaipur", "Central Delhi", "Bangalore"];
        const industries = ["Agriculture", "Agrochemicals & Fertilizers", "Seed Suppliers", "Farming Equipment"];
        const reasons = [
            "Delayed payment for agri supplies",
            "Payment bounced after delivery",
            "Dispute over quality leads to non-payment",
            "Credit period exceeded by 6 months",
            "Company declared bankruptcy"
        ];

        const fakeReports = [];
        for (let i = 1; i <= 100; i++) {
            const amount = Math.floor(Math.random() * 500000) + 10000;
            const outstanding = amount - (Math.random() > 0.7 ? Math.floor(Math.random() * (amount * 0.5)) : 0);

            fakeReports.push({
                user_id: effectiveUserId,
                reported_by_id: effectiveUserId,
                reported_by_role: 'member',
                defaulter_name: `Fake Company ${i} Ltd`,
                mobile_number: `98765432${(i % 100).toString().padStart(2, '0')}`,
                email_id: `contact@fakecompany${i}.com`,
                gst_number: `24AAAAA${i.toString().padStart(4, '0')}A1Z5`,
                pan_number: `ABCDE${i.toString().padStart(4, '0')}F`,
                state: states[i % states.length],
                district: districts[i % districts.length],
                cities: "Main City",
                financial_year: "2024-25",
                default_amount: amount,
                outstanding_amount: outstanding,
                industry: industries[i % industries.length],
                date_of_default: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
                reason_description: reasons[i % reasons.length],
                status: 1, // All Approved
                defaulter_address: `${i}th Industrial Estate, Phase II`,
            });
        }

        await DefaulterReport.insertMany(fakeReports);
        console.log('Successfully inserted 50 fake defaulter records.');

    } catch (err) {
        console.error('Error seeding data:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Connection closed.');
    }
}

seedDefaulters();
