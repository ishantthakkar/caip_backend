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
        required: true,
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
    businessAddress: { type: String, default: "" },
    industry: { type: String, default: "" },
    membershipExpiry: { type: String, default: "N/A" },
    companyEmail: { type: String, default: "" },
    alternateContactPerson: { type: String, default: "" },
    companyPhoneNumber: { type: String, default: "" },
    alternateContactNumber: { type: String, default: "" },
    websiteUrl: { type: String, default: "" },
    businessDocuments: { type: [String], default: [] },
    companyName: { type: String, default: "" },
    memberId: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    token: String
}, { timestamps: true });

const User = mongoose.model("user", userSchema);
module.exports = User;
