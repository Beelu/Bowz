if (process.env.NODE_ENV !== "production") {
	require('dotenv').config();
}

var express               = require("express"),
    app                   = express(),
    bodyparser            = require("body-parser"),
    mongoose              = require("mongoose"),
    passport              = require("passport"),
    passportLocal         = require("passport-local"),
    passportLocalMongoose = require("passport-local-mongoose"),
		fs										= require("fs"),
  	server 								= require("http").Server(app); 
		io										= require("socket.io")(server),
		path 									= require("path");
		middleware						=	require("./middleware"),
    user                  = require("./models/user"),
		async 								= require("async"),
		nodemailer						= require("nodemailer"),
		crypto 								= require("crypto"),
		randomNormal 		 		  = require('random-normal');

//房間所需要之暫存變數
var allRooms = new Map();
//var allUsers = new Map();

//初始設置
app.set("view engine", "ejs");
app.use(bodyparser.urlencoded({ extended: true }));

//資料庫初始設置
var url = process.env.databaseURL || "mongodb://localhost/project";
mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

//passport
app.use(require("express-session")({
	secret: "ZaWarudo",
	resave: false,
	saveUninitialized: false,
	cookie:{
		httpOnly:true,
		expires:Date.now() + 1000 * 60 * 60 * 24,
		maxAge: 1000 * 60 * 60 * 24
	}
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new passportLocal(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());
app.use(function (req, res, next) {
	res.locals.currentuser = req.user;
	next();
});

//==================================================================//
//主頁面
app.get("/", function(req, res){
  res.render("index");
});

//註冊頁面
app.get("/register", function(req, res){
  res.render("register");
});

//登入頁面
app.get("/login", function(req, res){
  res.render("login");
});

//登入實作
app.post("/login", function (req, res, next) {
	passport.authenticate('local', function(err, user, info) {
  	if (err) { return next(err); }
    if (!user) { return res.json({message:'user not exist!', user:user}); }
    req.logIn(user, function(err) {
  		if (err) { return next(err); }
      return res.json({message:'login success!', user:user});
    });
  })(req, res, next);
});

//註冊實作
app.post("/register", function(req, res){
	var newuser = new user({schoolname:req.body.schoolname, 
													ID:req.body.ID,
													username: req.body.username, 
													email: req.body.email});
	user.register(newuser, req.body.password, function(err, user){
		if(err){
			return res.status(500).json({message:"error", detail:err});
		}
		passport.authenticate("local")(req, res, function(){
			res.json({message:"success", user:user});
		});
	});
});

//房間頁面
app.get("/room/:id", function(req, res){
	if(!allRooms.get(req.params.id)){
		res.render("room", {roomInf: {total: 0}});
	}else{
		res.render("room", {roomInf: allRooms.get(req.params.id)});
	}
})

//入口頁面
app.get("/entrance", middleware.isLogin, function(req, res){
	res.render("entrance");
})

//進入房間
app.post("/room", function(req, res){
	res.redirect("/room/" + req.body.roomNum);
})

//==========================密碼相關====================//
//忘記密碼頁面
app.get("/forget", (req, res)=>{
	res.render("forget");
})

//重設密碼頁面
app.get("/reset/:token", (req, res) => {
	user.findOne({resetPWtoken:req.params.token, resetPWexpires:{$gt:Date.now()}}, (err, founduser) => {	//$gt=greater than
		if(err){
			return res.status(500).json({message:"error", detail:err});
		}
		res.render("reset", {token:req.params.token});
	});
});

//忘記密碼後的寄信功能實作
app.post("/forget", (req, res) => {
	async.waterfall([
		//第一步-先產生隨機token
		function(done){
			crypto.randomBytes(20, function(err, buf){
				var token = buf.toString('hex');		//對buf進行編碼產生token
				done(err, token);
			});
		},
		//第二步-找到該使用者並設定其token和過期時間
		function(token, done){
			user.findOne({email:req.body.email}, function(err, founduser){
				if(!founduser){
					return res.status(404).json({message:"error, user doesn't exist."});
				}
				
				founduser.resetPWtoken = token;
				founduser.resetPWexpires = Date.now() + 3600000;  //1小時
				
				founduser.save((err) => {
					done(err, token, founduser);
				});
			});
		},//第三步-寄email
		function(token, founduser, done){
			var transport = nodemailer.createTransport({
				service:"Gmail",
				auth:{
					user: "gankgank8787@gmail.com",
					pass: process.env.appPW
				},
			});
			var content = {
				to: founduser.email,
				from: "gankgank8787@gmail.com",
				subject: "Reset Password From YelpCamp",
				text: "click the link below to reset you password.\n http://" + req.headers.host + "/reset/" + token
			}
			transport.sendMail(content, (err) => {
				console.log("email has been send to " + user.email + ", please check with further instruction.");
				done(err, "done");
			});
		},//最後的錯誤處理
		function(err){
			if(err) console.log(err);
			res.status(500).json({message:"error", detail:err});
		}
	]);
});

//重設密碼功能實作
app.post("/reset/:token", (req, res) => {
	user.findOne({resetPWtoken:req.params.token, resetPWexpires:{$gt:Date.now()}}, (err, founduser) => {
		if(err){					//搜尋資料庫發生錯誤
			return res.status(500).json({message:"error", detail:err});
		}	
		if(req.body.password === req.body.confirm){
			founduser.setPassword(req.body.password, (err) => {
				if(err){			//重新設定密碼時發生錯誤
					return res.status(500).json({message:"error", detail:err});
				}
				founduser.resetPWtoken = undefined;
				founduser.resetPWexpires = undefined;
				
				founduser.save((err) => {				//儲存重設密碼回資料庫
					req.logIn(founduser, (err) => {					//儲存完後自動登入
						res.json({message:"Successfully reset password, automatically login."});
					});
				});
			});
		}else{			//如果密碼兩個打得不一樣
			return res.json({messageL:"password not equal."});
		}
	});
});

//==================================一般功能(尚未連線)================================//
//進入房間名單
app.post("/enterRoom", (req, res)=>{
	thisRoom = allRooms.get(req.body.roomNum);
	thisRoom.Users.set(data.ID, {username: data.username, money: 0, isManager:false})				//設定進入使用者的資料
	thisRoom.total = thisRoom.Users.size;
	allRooms.set(data.roomNum, thisRoom);		//更新房間資訊
	
	console.log(allRooms.get(data.roomNum));
});

//開新房間
app.post("/openRoom", (req, res)=>{
	roomID = '9487'//Math.floor(Math.random()*66500).toString();

	var Users = new Map();				//新增該房間使用者名單
	Users.set(req.body.ID, {username: req.body.username, isManager:true});					//設定進入開房者的資料
	allRooms.set(roomID, {roomName:req.body.roomName,
												roundNum:req.body.roundNum,
												gameType:req.body.gameType, 
												ratio:req.body.ratio, 
												initMoney:req.body.initMoney,
												saleMin:req.body.saleMin, 
												saleMax:req.body.saleMax, 
												buyMin:req.body.buyMin, 
												buyMax:req.body.buyMax, 
												item:req.body.item, 
												interval:req.body.interval,
												Users:Users, 
												total:1});
		
	console.log(roomID);
	res.json({pinCode: roomID});
});

//===================================socket.io=======================================//
io.on('connection',(socket)=>{
	//進入房間
	socket.on('enterRoom', (data)=>{
		socket.join(data.roomNum);
	});

	// //關閉房間
	// socket.on('closeRoom', (data)=>{
	// 	//var roomUsers = io.sockets.adapter.rooms.get(data.roomNum);
	// 	//io.sockets.adapter.rooms.delete(data.roomNum);
	// 	console.log(io.sockets.adapter.rooms);
	// 	socket.leave(data.roomNum);
	// });

	//================林育緹部分===================//
	//開始遊戲的發放身份與金錢
	socket.on('startGame', (data)=>{

		let thisRoom = allRooms.get(data.roomNum);
		let total = thisRoom.total;
		let saleMax = thisRoom.saleMax;
		let buyMax = thisRoom.buyMax;
		let saleMin = thisRoom.saleMin;
		let buyMin = thisRoom.buyMin;
		let interval = thisRoom.interval;
		let ratio;
		let i=1;

		if(thisRoom.ratio == null){
			do{
				ratio = randomNormal({mean: 0.5})
			}while( ratio < 0.3 || ratio > 0.7)
		}else{
			ratio = thisRoom.ratio;
		}

		let sellerNum = ratio * total;

		thisRoom.Users.forEach(function(value,key) {
			if(i<=sellerNum){
				money = Math.floor(Math.random() * (saleMax-saleMin) ) + saleMin
				money = interval * Math.ceil(money/interval)
				value.role = 'seller' 
				value.money = money 
			}
			else{
				money = Math.floor(Math.random() * (buyMax-buyMin)) + buyMin
				money = interval * Math.ceil(money/interval)
				value.role = 'buyer' 
				value.money = money 
			}
			thisRoom.Users.set(key,value)
			i++;
		  });
	
		allRooms.set(data.roomNum, thisRoom);	
		console.log(allRooms)

		userData = thisRoom.Users
		io.emit('startGameData', Array.from(userData));
	});


	socket.on('lineChart',(data)=>{

		let buyerData = [];
		let sellerData = [];
		thisRoom = allRooms.get(data.roomNum);

		thisRoom.Users.forEach(function(value, key) {
			if(value.role=="buyer"){
				buyerData.push({money:value.money});
			}else{
				sellerData.push({money:value.money});
			}
		  });

		allMoney.set('buyer',buyerData);
		allMoney.set('seller',sellerData);

		console.log(allMoney)

		io.emit('lineChartData',Array.from(allMoney));

	})
	//===============林育緹部分結束==================//

	//===============高鵬雲的部分====================//
  // 接收用户消息,發送公告至房間
  socket.on('message', function (msg) {
    // 验证如果用户不在房间内则不给发送
    if (roomInfo[roomID].indexOf(user) === -1) {  
      return false;
    }
    socketIO.to(roomID).emit('msg', user, msg);
  });


 /*掃到 QR code
  *回傳收錢者的 目前金額
  */
  app.post("/scanQRcode", function (req, res) {
    

    var req_payer = req.body.transaction['payer'];//獲取收款人id
    var thisRoom = allRooms.get('newroom');//獲取房間id    ////假資料!!!!!!!
    var theseUsers = thisRoom.allUsers;//獲取房間所有user
    var reciver_info = theseUsers.get(req_payer);//獲取收款人資料

    res.json(reciver_info.money);
  });

  /*交易確認要求
  *找payer
  *回傳付錢者回應
  */
  app.post("/checkQRcode", function (req, res, next) {

    
    const payer_id = req.body.transaction['payer']//獲取付款者ID
    const receiver_id = req.body.transaction['receiver']//獲取付款者ID
    const money = req.body.transaction['money']//獲取付款者ID

    console.log("收到確認要求"+payer_id)

    //廣播搜尋
    socketIO.emit('search_user', payer_id);

    //聽取回應
    socket.on('get_chek_point', function(chek_point){

        console.log(chek_point)        
        
        //交易成功寫入交易紀錄表
        if(chek_point==='1'){
          records.set(records.size+1, {seller: receiver_id, buyer: payer_id, price: money})
          console.log(records)
        }

         //回傳res
         res.send(chek_point);

    })

  });

	//交易紀錄要求
  socket.on('sendRecordRequest', function(){
  	//傳送交易紀錄
  	socket.emit('getRecordRequest', Array.from(records))
  });
	//============高鵬雲的部分結束=============//
});  

server.listen(process.env.PORT || 3000, process.env.IP, function () {
	console.log("Server Start!");
});

/* 
房間暫存參數(Map):
		allRooms[房間ID:int]{
			gameType: 遊戲類型，型態int
			ratio: 買賣方比例，型態float
			initMoney: 初始金額，型態int
			saleMin: 賣價下限，型態int
			saleMax: 賣價上限，型態int
			buyMin: 買價下限，型態int
			buyMax: 買價上限，型態int
			roundTime: 回合時間，型態Date
			interval: 價格區間，型態int
			item: 自創物品，例如排放權之類的，型態string
			Users: 所有使用者，型態map
		}

玩家暫存參數(Map):
		Users[學號:int]{
			username: 玩家名字，型態string
			role: 買賣身分，型態int
			money: 玩家錢，型態int
			item: 自創物品，型態string
			score: 總分數，型態int
		}

		allUsers[房間ID:int]{
			Users: 各房間的所有使用者，型態Map
		}

交易紀錄參數(Array):
  records[index]{
   seller: 賣方ID，型態int
   buyer: 買方ID，型態int
   price: 交易金額，型態int
  }
*/