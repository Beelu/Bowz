var mongoose = require("mongoose");

var TranscReocrdCSVSchema = new mongoose.Schema({
    RoomNum: String,
    transactions: String
});

module.exports = mongoose.model("TranscReocrdCSV", TranscReocrdCSVSchema);