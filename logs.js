const mongoose = require("mongoose");
const LogSchema = new mongoose.Schema({
    surflineNumber: {
        type: String,
        required: true,
    },

    status: {
        type: Number,
        required: true,

    },
    requestBody: {
        type: String,
        required: true,
    },
    responseBody: {
        type: String,
        required: true,
    },
    createdAt: {type: Date, default: Date.now}


});

const Log = mongoose.model("logs", LogSchema);
module.exports = Log;
