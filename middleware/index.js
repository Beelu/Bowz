var room = require("../models/room");

var middleware = {};

middleware.isLogin = function(req, res, next){
	if(req.isAuthenticated()){
		return next();
	}
	res.status(500).json({ message: '尚未登入'});
}

middleware.checkOwnership = function(req, res, next){
	room.findById(req.params.id, function(err, foundroom){
		if(err){
			res.status(500).json({ message: 'Something Get Wrong!'});
		}else{
			if((req.isAuthenticated() && foundroom.email.equals(req.user.email)) || req.user.isManager){
				next();
			}else{
				res.status(500).json({ message: "You Don't Have Permission To Do This."});
			}
		}
	});
}

module.exports = middleware;