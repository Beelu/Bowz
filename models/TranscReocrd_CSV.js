<<<<<<< HEAD
var mongoose = require("mongoose");

var TranscReocrdCSVSchema = new mongoose.Schema({
    RoomNum: String,
    transactions: String
});

=======
var mongoose = require("mongoose");

var TranscReocrdCSVSchema = new mongoose.Schema({
    RoomNum: String,
    transactions: String
});

>>>>>>> 9cdb43956a456ff3bed622ab20db760aee773e2f
module.exports = mongoose.model("TranscReocrdCSV", TranscReocrdCSVSchema);