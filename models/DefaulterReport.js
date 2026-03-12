const mongoose = require("mongoose");

const defaulterReportSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    defaulter_name: String,
    mobile_number: String,
    email_id: String,
    gst_number: String,
    pan_number: String,
    cin_number: String,
    aadhar_number: String,
    state: String,
    district: String,
    cities: String,
    financial_year: String,
    default_amount: Number,
    outstanding_amount: Number,
    industry: String,
    date_of_default: Date,
    reason_description: String,
    attachment_documents: [String],
    status: { type: Number, default: 0 }, // 0 = Pending, 1 = Approved
    report_user_id: Number,
    defaulter_address: String,
    court_complex_name: String,
    case_type: String,
    case_number: String,
    case_year: String,
    case_status: String,
    payments: [{
        amount: Number,
        date: Date
    }]
}, { timestamps: true });

const DefaulterReport = mongoose.model("defaulter_report", defaulterReportSchema);
module.exports = DefaulterReport;
