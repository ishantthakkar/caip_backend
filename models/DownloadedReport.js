const mongoose = require("mongoose");

const DownloadedReportSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    report_name: { type: String, required: true },
    report_file: { type: String, required: true },
    search_criteria: { type: Object },
    download_date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("downloaded_report", DownloadedReportSchema);
