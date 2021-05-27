var mongoose = require("mongoose");

var roomSchema = new mongoose.Schema({
  owner:String,       //email
  roundInfo:[{
    ratio: Number,
    initMoney: Number,
    saleMin: Number,
    saleMax: Number,
    buyMin: Number,
    buyMax: Number,
    interval: Number,
    item: String,
  }],
  gameType: Number,
  roomName: String,
  roundTime: Number,
});

module.exports = mongoose.model("room", roomSchema);