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
    cities: String, // This field is used for Sub-District
    city: String,
    financial_year: String,
    default_amount: Number,
    outstanding_amount: Number,
    industry: String,
    date_of_default: Date,
    reason_description: String,
    attachment_documents: [String],
    status: { type: Number, default: 0 }, // 0 = Pending, 1 = Approved, 2 = Rejected
    reported_by_id: { type: mongoose.Schema.Types.ObjectId },
    reported_by_role: { type: String, enum: ['member', 'sub-member'] },
    report_user_id: Number,
    defaulter_address: String,
    court_complex_name: String,
    case_type: String,
    case_number: String,
    case_year: String,
    case_status: String,
    legal_status_taken: { type: Boolean, default: false },
    defaulter_persons: [{
        name: String,
        pan: String,
        aadhar: String
    }],
    payments: [{
        amount: Number,
        date: Date,
        type: { type: String, enum: ['partial', 'settlement'], default: 'partial' }
    }],
    isSettled: { type: Boolean, default: false },
    settledAmount: Number,
    settledBy: String,
    settlementDate: Date
}, { timestamps: true });

const DefaulterReport = mongoose.model("defaulter_report", defaulterReportSchema);
module.exports = DefaulterReport;
