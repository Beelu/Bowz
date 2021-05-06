var mongoose = require("mongoose");

var recordSchema = new mongoose.Schema({
  roomNum: String,
  date: Date,
  transactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "transaction"
  }]
});

module.exports = mongoose.model("record", recordSchema);