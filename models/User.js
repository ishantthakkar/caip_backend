const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: false,
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    },
    state: {
        type: String,
        required: true,
    },
    district: {
        type: String,
        required: true,
    },
    subDistrict: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: false,
    },
    businessDocument: {
        type: String,
        default: null,
    },
    gst: {
        type: String,
        required: false,
    },
    pan: {
        type: String,
        required: false,
    },
    role: {
        type: String,
    },
    status: {
        type: String,
    },
    membership_status: {
        type: String,
        default: "0"
    },
    businessType: { type: String, default: "" },
    yearsInBusiness: { type: String, default: "" },
    cinNumber: { type: String, default: "" },
    pinCode: { type: String, default: "" },
    businessAddress: { type: String, required: true },
    industry: { type: String, default: "" },
    membershipExpiry: { type: String, default: "N/A" },
    membershipBenefits: { type: [String], default: [] },
    planName: { type: String, default: "" },
    subMemberLimit: { type: Number, default: 0 },
    companyEmail: { type: String, default: "" },
    alternateContactPerson: { type: String, default: "" },
    companyPhoneNumber: { type: String, default: "" },
    alternateContactNumber: { type: String, default: "" },
    websiteUrl: { type: String, default: "" },
    businessDocuments: { type: [String], default: [] },
    companyName: { type: String, default: "" },
    memberId: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    profileImage: { type: String, default: null },
    acceptedTermsId: { type: mongoose.Schema.Types.ObjectId, ref: 'TermsCondition', default: null },
    token: String
}, { timestamps: true });

const User = mongoose.model("user", userSchema);
module.exports = User;
module.exports = User;
