const mongoose = require("mongoose");

const SearchHistorySchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    filters: Object,
    resultCount: Number,
}, { timestamps: true });

const SearchHistory = mongoose.model("search_history", SearchHistorySchema);
module.exports = SearchHistory;
