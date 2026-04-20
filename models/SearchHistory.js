const mongoose = require("mongoose");

const SearchHistorySchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    filters: Object,
    resultData: Object,
    resultCount: Number,
    defaulter_id: { type: mongoose.Schema.Types.ObjectId, ref: "defaulter_report", default: null }
}, { timestamps: true });

const SearchHistory = mongoose.model("search_history", SearchHistorySchema);
module.exports = SearchHistory;
