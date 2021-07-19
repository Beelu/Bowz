var mongoose = require("mongoose");

var roomSchema = new mongoose.Schema({
  email:String,       //owner
  roundInfo:[{
    ratio: String,
    saleMin: Number,
    saleMax: Number,
    buyMin: Number,
    buyMax: Number,
    interval: Number,
    item: String,
  }],
  initMoney: Number,
  gameType: Number,
  roomID: Number,
  roomName: String,
  roundTime: Number,
  active: Boolean,
  nowRoomID: Number
});

module.exports = mongoose.model("room", roomSchema);