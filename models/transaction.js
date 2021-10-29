var mongoose = require("mongoose");

var transactionSchema = new mongoose.Schema({
  record:{
		id:{type: mongoose.Schema.Types.ObjectId, ref: "record"},
		roomNum: String
	},
  roundNum: String,
  seller: String,
  buyer: String,
  price: Number
});

module.exports = mongoose.model("transaction", transactionSchema);