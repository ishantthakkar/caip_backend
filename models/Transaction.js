const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    txNo: {
        type: String,
        required: true,
        unique: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    plan_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'membership_plan'
    },
    type: {
        type: String,
        default: 'New Membership'
    },
    status: {
        type: String,
        default: 'Success'
    }
}, { timestamps: true });

const Transaction = mongoose.model("transaction", transactionSchema);
module.exports = Transaction;
