var room = require("../models/room");
var user = require("../models/user")

var middleware = {};

middleware.isLogin = function(req, res, next){
	const token = req.header('Authorization').replace('Bearer ', '')
	jwt.verify(token, "ZaWarudo", (err, decode)=>{
		if(err){
			res.status(500).json({ message: '驗證失敗，請重新登入'});
		}
		else{
			next()
		}
	})
}

middleware.checkOwnership = function(req, res, next){
	const token = req.header('Authorization').replace('Bearer ', '')
	jwt.verify(token, "ZaWarudo", (err, decode)=>{
		if(err){
			res.status(500).json({ message: "You Don't Have Permission To Do This."});
		}
		else{
			room.findById(req.params.id, function(err, foundroom){
				if(err){
					res.status(500).json({ message: 'Something Get Wrong!'});
				}else{
					if(foundroom.email.equals(decode.email)){
						next();
					}else{
						res.status(500).json({ message: "You Don't Have Permission To Do This."});
					}
				}
			});
		}
	})
}

module.exports = middleware;