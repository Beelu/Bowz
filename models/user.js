var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose");

var userSchema = new mongoose.Schema({
	email:{type:String, unique:true, required: true},
  password: String,
  schoolname:String,
  ID:String,
  username:String,
  avatar:Number,
  allScore:String,
  teacher:String,
  isManager:Boolean,
  resetPWtoken: String,
	resetPWexpires: String,
});

userSchema.plugin(passportLocalMongoose, {usernameField: "email"});

module.exports = mongoose.model("user", userSchema);