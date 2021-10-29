
var mongoose = require("mongoose");

var TranscRecordCSVSchema = new mongoose.Schema({
    RoomNum: String,
    transactions: String
});

module.exports = mongoose.model("TranscRecordCSV", TranscRecordCSVSchema);