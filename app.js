const { throws } = require('assert');
const { countReset } = require('console');
const { Socket } = require('dgram');
const { connect } = require('http2');
const {MongoClient} = require('mongodb');
const { decode } = require('querystring');
const { all } = require('underscore');

if (process.env.NODE_ENV !== "production") {
	require('dotenv').config();
}

var express = require("express"),
	app = express(),
	bodyparser = require("body-parser"),
	mongoose = require("mongoose"),
	passport = require("passport"),
	passportLocal = require("passport-local"),
	passportLocalMongoose = require("passport-local-mongoose"),
	fs = require("fs"),
	server = require("http").Server(app),
	https = require('https'),
	//io = require("socket.io")(server),
	path = require("path"),
	middleware = require("./middleware"),
	user = require("./models/user"),
	transaction = require('./models/transaction'),
	record = require('./models/record'),
	room = require('./models/room'),
	async = require("async"),
	nodemailer = require("nodemailer"),
	crypto = require("crypto"),
	cors = require("cors"),
	randomNormal = require('random-normal'),
	jwt = require("jsonwebtoken"),
	socketioJwt = require("socketio-jwt"),
	lodash = require("lodash"),
	util = require('util');


//房間所需要之暫存變數
var allRooms = new Map();
var testusers = new Map();
//var records = [];
var tmpChartData = new Map();
var totalChartData = new Map();

testusers.set('123', {username: '123', money: 500, role:"buyer",  price:60,  item:null, score:50, socketID:null});
testusers.set('234', {username: '234', money: 570, role:"buyer",  price:70,  item:null, score:60, socketID:null});
testusers.set('345', {username: '345', money: 400, role:"buyer",  price:120, item:null, score:20, socketID:null}); 
testusers.set('456', {username: '456', money: 450, role:"seller", price:100, item:null, score:30, socketID:null});
testusers.set('567', {username: '567', money: 760, role:"seller", price:90,  item:null, score:40, socketID:null});
testusers.set('678', {username: '678', money: 350, role:"seller", price:90,  item:null, score:90, socketID:null});
allRooms.set("9487",{
	round:[{
		ratio: 0.7,
		saleMin: 10,
		saleMax: 100,
		buyMin: 20,
		buyMax: 120,
		item: "apple",
		record:[{seller:"123", buyer:"234", price:120}, {seller:"234", buyer:"456", price:130}]},
	{
		ratio: 0.7,
		saleMin: 10,
		saleMax: 100,
		buyMin: 20,
		buyMax: 120,
		item: "yanshou",
		record:[{seller:"456", buyer:"123", price:100}, {seller:"234", buyer:"678", price:200}]}
	],
	initMoney: 100,
	isGaming:false,
	gameType: 1,
	roundTime:120,
	interval: 10,
	roomName:"保志的測試",
	Users:testusers,
	nowRound:-1,
	admin_transc_times:0
})
//初始設置
app.set("view engine", "ejs");
app.use(bodyparser.urlencoded({ extended: true }));
app.use(cors({credentials: true}));

//https
// var options = {
// 	key: fs.readFileSync('./server-key.pem'),
// 	ca: [fs.readFileSync('./cert.pem')],
// 	cert: fs.readFileSync('./server-cert.pem')
// };

// Certificate
const privateKey = fs.readFileSync('./privkey.pem', 'utf8');
const certificate = fs.readFileSync('./fullchain.pem', 'utf8');
const options = {
	key: privateKey,
	cert: certificate,
	ca: certificate
};
var httpsServer = https.createServer(options, app)
var io = require("socket.io")(httpsServer, {
	cors: {
		origin: "https://lbdgame.mgt.ncu.edu.tw",
		allowedHeaders: ["authorization"],
		credentials: true,
		allowEIO3: true
	}
})

//資料庫初始設置
var url = process.env.databaseURL //|| "mongodb://localhost/project";
mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });
const client = new MongoClient(url);

//passport
app.use(require("express-session")({
	secret: "ZaWarudo",
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		expires: Date.now() + 1,
		maxAge: 1
	}
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new passportLocal(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());


//==================================================================//
//主頁面
app.get("/", function (req, res) {
	res.render("index");
});

//註冊頁面
app.get("/register", function (req, res) {
	res.render("register");
});

//登入頁面
app.get("/login", function (req, res) {
	res.render("login");
});

//登入實作
app.post("/login", function (req, res, next) {
	passport.authenticate('local', function (err, user, info) {
		if (err) { return next(err); }
		if (!user) { return res.status(500).json({ message: 'login fall!', user: user }); }
		req.logIn(user, { session: false }, function (err) {
			if (err) { return next(err); }
			var expiretime = Date.now() + 60 * 60 * 1000;
			const token = jwt.sign({ _id: user._id, email:user.email }, 'ZaWarudo', { issuer:'Dio', expiresIn: '2h' })
			res.json({ message: 'login success!', user: user, jwt: token, expiresIn: expiretime});
		});
	})(req, res, next);
});

//升為管理者
app.post("/promotion", function(req, res){
	user.findOneAndUpdate({email: req.body.email}, {isManager: true}, (err, updateuser) => {
		if(err){return res.json({message: "something got wrong."})}
		res.json({message: "update completed.", email: updateuser.email})
	})
})

//註冊驗證
app.post("/register", function (req, res) {
	var newuser = new user({
		schoolname: req.body.schoolname,
		ID: req.body.ID,
		username: req.body.username,
		email: req.body.email,
		isManager: false
	});
	user.register(newuser, req.body.password, function (err, user) {
		if (err) {
			return res.status(500).json({ message: "error", detail: err });
		}
		req.logIn(user, { session: false }, function (err) {
			if (err) { return next(err); }
			reg_email(req.body.email);
			var expiretime = Date.now() + 60 * 60 * 1000;
			const token = jwt.sign({ _id: user._id, email:user.email }, 'ZaWarudo', { issuer:'Dio', expiresIn: '2h' })
			res.json({ message: "Successfully register.", user: user, jwt: token, expiresIn: expiretime});
		});
	});
});

//註冊成功寄信
function reg_email(user_email){
	async.waterfall([
		function (done) {
			var transport = nodemailer.createTransport({
				service: "Gmail",
				auth: {
					user: "lbdgame.service@gmail.com",
					pass: process.env.appPW
				},
			});
			var content = {
				to: user_email,
				from: "lbdgame",
				subject: "registration success",
				text: "you can click the link below to go to the gamelobby.\n https://lbdgame.mgt.ncu.edu.tw"
			}
			transport.sendMail(content, (err) => {
				console.log("email has been send to " + user_email + ", please check with further instruction.");
				done(err, "done");
			});
		},//最後的錯誤處理
		function (err) {
			res.json({ message: "done", detail: err });
		}
	]);
}

//房間頁面
app.get("/room/:id", function (req, res) {
	if (!allRooms.get(req.params.id)) {
		res.render("room", { roomInf: { total: 0 } });
	} else {
		res.render("room", { roomInf: allRooms.get(req.params.id) });
	}
})

//入口頁面
app.get("/entrance", function (req, res) {
	res.render("entrance");
})

//進入房間
app.post("/room", function (req, res) {
	res.json({user: res.locals.currentuser})
	//res.redirect("/room/" + req.body.roomNum);
})

//==========================密碼相關====================//
//忘記密碼頁面
app.get("/forget", (req, res) => {
	res.render("forget");
})

//重設密碼頁面
app.get("/reset/:token", (req, res) => {
	user.findOne({ resetPWtoken: req.params.token, resetPWexpires: { $gt: Date.now() } }, (err, founduser) => {	//$gt=greater than
		if (err) {
			return res.status(500).json({ message: "error", detail: err });
		}
		res.render("reset", { token: req.params.token });
	});
});

//忘記密碼後的寄信功能實作
app.post("/forget", (req, res) => {
	async.waterfall([
		//第一步-先產生隨機token
		function (done) {
			crypto.randomBytes(20, function (err, buf) {
				var token = buf.toString('hex');		//對buf進行編碼產生token
				done(err, token);
			});
		},
		//第二步-找到該使用者並設定其token和過期時間
		function (token, done) {
			user.findOne({ email: req.body.email }, function (err, founduser) {
				if (!founduser) {
					return res.status(404).json({ message: "error, user doesn't exist." });
				}

				founduser.resetPWtoken = token;
				founduser.resetPWexpires = Date.now() + 3600000;  //1小時

				founduser.save((err) => {
					done(err, token, founduser);
				});
			});
		},//第三步-寄email
		function (token, founduser, done) {
			var transport = nodemailer.createTransport({
				service: "Gmail",
				auth: {
					user: "lbdgame.service@gmail.com",
					pass: process.env.appPW
				},
			});
			var content = {
				to: founduser.email,
				from: "lbdgame",
				subject: "Reset Password",
				text: "click the link below to reset you password.\n https://lbdgame.mgt.ncu.edu.tw/forgetpassword2?token=" + token
			}
			transport.sendMail(content, (err) => {
				console.log("email has been send to " + user.email + ", please check with further instruction.");
				done(err, "done");
			});
		},//最後的錯誤處理
		function (err) {
			res.json({ message: "done", detail: err });
		}
	]);
});

//重設密碼功能實作
app.post("/reset/:token", (req, res) => {
	user.findOne({ resetPWtoken: req.params.token, resetPWexpires: { $gt: Date.now() } }, (err, founduser) => {
		if (err) {					//搜尋資料庫發生錯誤
			return res.status(500).json({ message: "error", detail: err });
		}
		founduser.setPassword(req.body.password, (err) => {
			if (err) {			//重新設定密碼時發生錯誤
				return res.status(500).json({ message: "error", detail: err });
			}
			founduser.resetPWtoken = undefined;
			founduser.resetPWexpires = undefined;

			founduser.save((err) => {				//儲存重設密碼回資料庫
				req.logIn(founduser, (err) => {					//儲存完後自動登入
					res.json({ message: "Successfully reset password, automatically login." });
				});
			});
		});
	});
});

//==================================一般功能(尚未連線)================================//
//進入房間名單
app.post("/enterRoom", (req, res) => {
	var thisRoom = allRooms.get(req.body.roomNum);
	if (thisRoom) {
		thisRoom.Users.set(req.body.ID, { username: req.body.username, money: 100, isManager: false ,price : 0})		//設定進入使用者的資料
		thisRoom.total = thisRoom.Users.size;
		allRooms.set(req.body.roomNum, thisRoom);		//更新房間資訊

		console.log(allRooms.get(req.body.roomNum));
		res.json({ roomDetail: thisRoom, allUsers: [...thisRoom.Users] });
	} else {
		res.status(500).json({ message: "room doesn't exist." });
	}
});

//創新房間(加進資料庫)
app.post("/createRoom", (req, res) => {
	var createRoom = {
		email: req.body.email,
		interval: req.body.interval,
		roundInfo: req.body.roundInfo,
		initMoney: req.body.initMoney,
		gameType: req.body.gameType,
		roomName: req.body.roomName,
		roundTime: req.body.roundTime,
		active: false,
		nowRoomID: null
	}

	room.create(createRoom, (err, newRoom) => {
		if (err) {
			return res.json({message:err})
		}
		res.json({message:"successfully create room."})
	})
});

//編輯房間
app.post("/editRoom/:id", middleware.checkOwnership, (req, res) => {
	var editRoom = {
		email: req.body.email,
		interval: req.body.interval,
		roundInfo: req.body.roundInfo,
		initMoney: req.body.initMoney,
		gameType: req.body.gameType,
		roomName: req.body.roomName,
		roundTime: req.body.roundTime,
		active: false,
		nowRoomID: null
	}

	room.findById(req.params.id, (err, found) => {
		if(err){
			res.json({message:"something got wrong."});
		}else{
			editRoom.active = found.active;
			editRoom.nowRoomID = found.nowRoomID;
			room.findByIdAndUpdate(req.params.id, editRoom, (err, updated) => {
				if(err){
					res.json({message:"something got wrong."});
				}else{
					res.json({message:"successfully edit room."});
				}
			});
		}
	})
});

//取得特定房間資訊
app.post("/showRoom/:id", (req, res) => {
	room.findById(req.params.id, (err, foundroom) => {
		if(err){
			res.json({message:"something got wrong."})
		}else{
			res.json(foundroom)
		}
	})
})

//刪除特定房間
app.post("/deleteRoom/:id", (req, res) => {
	room.findByIdAndRemove(req.params.id, (err, delroom) => {
		if(err){
			res.json({message:"something got wrong."})
		}
		else if(!delroom){
			res.json({message:"room doesn't exist"});
		}else{
			res.json({message:"successfully delete room.", room_id: delroom._id})
		}
	})
})

//開新房間
app.post("/openRoom", (req, res) => {
	randomID = Math.floor(Math.random() * 99999).toString();
	while(allRooms.get(randomID)){
		randomID = Math.floor(Math.random() * 99999).toString();
	}

	var Users = new Map();				//新增該房間使用者名單
	Users.set(req.body.ID, { username: req.body.name, isManager: true });					//設定進入開房者的資料
	room.findById(req.body.roomID, (err, findroom) => {
		if(err){
			return res.status(500).json({message:"database error"});
		}

		if(findroom.active){
			res.json({message:"room already exist.", pinCode: findroom.nowRoomID});
		}else{
			var roundInfo = findroom.roundInfo;
			for(var i=0; i<roundInfo.length; i++){
				roundInfo[i]['record'] = [];
			}
			allRooms.set(randomID, {
				round:roundInfo,
				interval: findroom.interval,
				gameType:findroom.gameType,
				roundTime:findroom.roundTime,
				roomName: findroom.roomName,
				initMoney: findroom.initMoney,
				Users:Users,
				nowRound:-1,
				isGaming: false,
				admin_transc_times:0
			});
			findroom.active = true;
			findroom.nowRoomID = randomID;
			findroom.save();
			res.json({message:"new room.", pinCode: randomID });
		}
	});

	//console.log(allRooms);
});

//取得房間資訊
app.post("/getRoom", (req, res) => {
	findRoom = allRooms.get(req.body.roomNum);
	if(findRoom){
		res.json({ roomDetail: findRoom, allUsers: [...findRoom.Users] });
	}else{
		res.json({message:"can't find room", roomNum:req.body.roomNum})
	}
})

app.post('/chartData',(req,res)=>{

	let buyerMoneyData = [];
	let sellerMoneyData = [];


	let thisRoom = allRooms.get(req.body.roomNum);
	thisRoom.Users.forEach(function(value, key) {
		if(value.role=="buyer"){
			buyerMoneyData.push(value.price);
		}else{
			sellerMoneyData.push(value.price);
		}
	});

	buyerMoneyData.sort((a, b) => b - a);
	sellerMoneyData.sort((a, b) => a - b);

	let p = 0
	while (buyerMoneyData[p]-sellerMoneyData[p]>0){
		p++
	}

	tmpChartData.set(req.body.roomNum ,{buyer:buyerMoneyData,seller:sellerMoneyData,point:p})
	console.log(tmpChartData)
	res.json({chartData: {buyer:buyerMoneyData,seller:sellerMoneyData,point:p}});
})

app.post("/totalChartData", (req,res) => {
	let data = totalChartData.get(req.body.roomNum);
	res.json({data:data});
})

app.post("/downloadCSV", (req,res) => {
	let csv_data = null;
	let msg;

	try{
		let RoomNum = req.body.roomNum;
		let thisRoom = allRooms.get(RoomNum);

		if(thisRoom){
			let allUsers = thisRoom.Users;

			if(allUsers){
				csv_data = "玩家編號,分數 \r\n";

				function logAllUsersElements(value, key, map) {
					csv_data= csv_data+key+","+value.score+"\r\n";
				}				
				allUsers.forEach(logAllUsersElements)
			}else{//房間沒有玩家存在
				msg = "房間沒有玩家存在";
			}

		}else{//房間不存在
			msg = "房間不存在";
		}

		res.json({data:csv_data, msg:msg});
	}catch(e){
		msg = "未知的錯誤";
		res.json({data:csv_data, msg:msg});
	}

})

app.post("/changeSingleMoney", (req,res) => {
	let thisRoom = allRooms.get(req.body.roomNum);
	let index = req.body.index
	let role = req.body.role
	let money =  parseInt(req.body.money)
	let chartData = tmpChartData.get(req.body.roomNum);

	if (role == "seller"){
		oldMoney = chartData.seller[index]
		chartData.seller[index] = money
		chartData.seller.sort((a, b) => a - b);
	}
	else {
		oldMoney = chartData.buyer[index]
		chartData.buyer[index] = money
		chartData.buyer.sort((a, b) => b - a);
	}

	//改掉 Users的資料
	let count =0;
	thisRoom.Users.forEach(function(value,key) {
		if (count == 0){
			if (value.price == oldMoney && value.role == role){
				value.price = money
				count+=1
			}
		}
	});
	allRooms.set(req.body.roomNum, thisRoom);
	tmpChartData.set(req.body.roomNum,chartData);
	res.json({ chartData: chartData});
	
})


app.post("/changeRoleMoney", (req,res) => {
	let thisRoom = allRooms.get(req.body.roomNum);
	let bPrice =  parseInt(req.body.bAdjustPrice);
	let sPrice =  parseInt(req.body.sAdjustPrice);
	let buyerMoneyData = [];
	let sellerMoneyData = [];

	//把User裡屬於該role的金額依序調整
	thisRoom.Users.forEach(function(value, key) {
		if(value.role=="buyer"){
			value.price += bPrice 
			buyerMoneyData.push(value.price);
		}else{
			value.price += sPrice
			sellerMoneyData.push(value.price);
		}
	});

	//利用buyerMoneyData和sellerMoneyData做成chartData
	buyerMoneyData.sort((a, b) => b - a);
	sellerMoneyData.sort((a, b) => a - b);

	let p = 0
	while (buyerMoneyData[p]-sellerMoneyData[p]>0){
		p++
	}

	tmpChartData.set(req.body.roomNum ,{buyer:buyerMoneyData,seller:sellerMoneyData,point:p})
	allRooms.set(req.body.roomNum, thisRoom);	
	res.json({ chartData: {buyer:buyerMoneyData,seller:sellerMoneyData,point:p}});
	
})


//===========遊戲後儲存歷史資料===============
app.post('/closeRoom', (req, res) => {
	room.findById(req.body.roomID, (err, findroom) => {
		if(err){
			res.json({message:"something got wrong."})
		}else{
			findroom.active = false;
			findroom.nowRoomID = null;
			findroom.save();
			res.json({message:"room closed."})
		}
	});
});

app.post('/saveRecord', (req, res)=>{
	var saveRoom = allRooms.get(req.body.roomNum);
	var saveRecord = {
		roomNum:req.body.roomNum,
		date:Date.now()
	}
	record.create(saveRecord, async function(err, newRecord) {
		let tempTotalTrans = [];
		//儲存每個round的每筆資料
		async function recording() {
			for (let i=0; i<saveRoom.round.length; i++){
				for(let j=0; j<saveRoom.round[i].record.length; j++){
					var t = saveRoom.round[i].record[j];
					var tempRecord = {"id": newRecord._id, "roomNum": req.body.roomNum};
					t["roundNum"] = i;
					t["record"] = tempRecord;

					transaction.create(t, function(err, newTrans){
						if(err){
							console.log(err);
						}else{
							tempTotalTrans.push(newTrans);
						}
					});
				}
			}
			await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
		}
		await recording();
		//存進所有歷史紀錄
		// console.log(tempTotalTrans);
		newRecord.transactions = tempTotalTrans;
		newRecord.save();

		//刪除該房間
		allRooms.delete(req.body.roomNum);
		if (err) {
			res.status(500).json({message:err});
		}
		res.json({message:"room is closed, successfully record room information."})
	});
});


/*
* 獲取管理員創建的房間
* 使用email來搜尋
*/
app.post('/getRoomList', (req, res)=>{
        async function run() {
                var room_list = []
                try {

                        await client.connect();
                        const database = client.db("myFirstDatabase");
                        const rooms_model = database.collection("rooms");

                        const query = { email: req.body.email };
                        const user_rooms = await rooms_model.find(query).toArray();

                        for(i=0; i<user_rooms.length;i++){
                                var item_arr = [];
                                item_arr.push(user_rooms[i].roomName);
                                item_arr.push(user_rooms[i].roundInfo.length);
                                item_arr.push(user_rooms[i]._id);
                                room_list.push(item_arr);
                        }

                        res.json(room_list);
                        console.log("rreee",room_list)
                } finally {

                }
        }
        run()
});

	
//===================================socket.io=======================================//
//連線驗證登入並重設jwt
// io.use(function(socket, next){
// 	if (socket.handshake.query && socket.handshake.query.token){
// 		jwt.verify(socket.handshake.query.token, 'ZaWarudo', function(err, decoded) {
// 			if (err) return next(new Error('Authentication error'));
// 			const token = jwt.sign({ _id: decoded._id, email: decoded.email }, 'ZaWarudo', { issuer:'Dio', expiresIn: '2h' })
// 			socket.handshake.query.token = token;
// 			next();
// 		});
// 	}
// 	else {
// 		next(new Error('Authentication error'));
// 	}    
// });

// io.use(function(socket, next){
// 	console.log(socket.handshake);
// 	var tk = socket.handshake.headers.authorization.replace('Bearer ', '');
// 	if (tk){
// 		jwt.verify(tk, 'ZaWarudo', function(err, decoded) {
// 			if (err) return next(new Error('Authentication error'));
// 			const token = jwt.sign({ _id: decoded._id, email: decoded.email }, 'ZaWarudo', { issuer:'Dio', expiresIn: '2h' })
// 			socket.handshake.query.token = token;
// 			console.log(token)
// 			next();
// 		});
// 	}
// 	else {
// 		next(new Error('Authentication error'));
// 	}    
// });

io.use(socketioJwt.authorize({
	secret: "ZaWarudo",
	handshake: true,
	auth_header_required: true
}));

//連線成功
io.on('connection', (socket) => {
	//進入房間
	socket.on('enterRoom', (data) => {
		var newToken = 'null';
		if(socket.handshake.query.token){
			newToken = socket.handshake.query.token
		}
		try{
			var thisRoom = allRooms.get(data.roomNum);
			if (thisRoom) {
				socket.join(data.roomNum);

				var thisUser = thisRoom.Users.get(data.ID)
				if(thisUser){

					socket.emit('enterRoom_resp',{status:0, msg:'已在房間，僅連接socket', user: thisUser, newToken: newToken});//回應enterRoom
				}else{
					if(thisRoom.isGaming){
						return socket.emit('enterRoom_resp',{status:3, msg:'遊戲已開始，無法進入房間'});
					}
					thisRoom.Users.set(data.ID, { username: data.username, money: thisRoom.initMoney, isManager: false ,price : 0, socketID:null})		//設定進入使用者的資料
					thisRoom.total = thisRoom.Users.size;
					allRooms.set(data.roomNum, thisRoom);		//更新房間資訊
					socket.emit('enterRoom_resp',{status:1, msg:'已進入房間並連接socket', newToken: newToken});//回應enterRoom
				};
			} else {
				socket.emit('enterRoom_resp',{status:2 , msg:'房間並不存在'});//回應enterRoom
			}
		}catch(e){
			socket.emit('enterRoom_resp',{status:-1, msg:'error'});//回應enterRoom
		}
	});

	//離開
	socket.on('leaveRoom', (data) => {
		try{
			socket.leave(data.roomNum)
		}		
		catch(e){
		}	
	});
	
	//關閉房間(老師按按鈕)
	socket.on('closeRoom', (data) => {
		try{
			io.in(data.roomNum).emit('get_out');
		}       
		catch(e){
		}
	
	});

	//connection response
	socket.emit('socket_connect_resp', {s:'conresp'});

	//test
	socket.on('test', (data) => {
		socket.emit('testResponse', {s:"success"});
	});

	//給予角色資訊
	socket.on('reqRole', (data) => {
		try{
			var room = allRooms.get(data.roomNum);
			var info = room.Users.get(data.ID);
			var buy_trans = [];
			var sell_trans = [];
			if(room.round[room.nowRound]){
				buy_trans = lodash.filter(room.round[room.nowRound].record, { 'buyer': data.ID } );
				sell_trans = lodash.filter(room.round[room.nowRound].record, { 'seller': data.ID } );
			}
			socket.emit('resRole', {user: info, buyer: buy_trans, seller:sell_trans});
		}       
		catch(e){
			socket.emit('resRole','error')
		}
	
	})

	socket.on('startGame',(req)=>{
		try{
			if(allRooms.get(req.roomNum).isGaming == true){
				io.sockets.in(req.roomNum).emit('startGameResponse','error');
			}else{
				let tmp = tmpChartData.get(req.roomNum)
				let chartData = totalChartData.get(req.roomNum);
				if (chartData == null){
					chartData = [tmp];
				}else{
					chartData.push(tmp)
				}

				let currentTime = new Date();
				let tmpTime = currentTime.getTime();
				let expireTime = new Date();
				expireTime.setTime(tmpTime + 1000 * allRooms.get(req.roomNum).roundTime);
				allRooms.get(req.roomNum).expireTime = expireTime		
				
				totalChartData.set(req.roomNum,chartData);
				allRooms.get(req.roomNum).nowRound+=1;
				allRooms.get(req.roomNum).isGaming = true;
				io.sockets.in(req.roomNum).emit('startGameResponse', 'success');
				//io.emit('startTimeResponse', dt);
			}
		}       
		catch(e){
			io.sockets.in(req.roomNum).emit('startGameResponse','error')
		}
	
		
	});
	
	
	socket.on('startTime',(req)=>{
		try{
			let expireTime = allRooms.get(req.roomNum).expireTime
			io.sockets.in(req.roomNum).emit('startTimeResponse',expireTime.toLocaleString());
		}catch(e){
			io.sockets.in(req.roomNum).emit('startTimeResponse','error');
		
		}
	});

	socket.on('currentTime',(req)=>{
		try{
			let nowTime = new Date();
			let expireTime =  allRooms.get(req.roomNum).expireTime
			let remainSecond = (expireTime - nowTime )/1000
			io.sockets.in(req.roomNum).emit('currentTimeResponse',{remainSecond : remainSecond});
		}catch(e){
			io.sockets.in(req.roomNum).emit('currentTimeResponse','error');
	
		}
	});

	socket.on('endRound',(req)=>{
		try{
			if(allRooms.get(req.roomNum).isGaming == false){
				io.sockets.in(req.roomNum).emit('endRoundResponse','error');
			}else if(allRooms.get(req.roomNum).nowRound+1 >= allRooms.get(req.roomNum).round.length){
				allRooms.get(req.roomNum).isGaming = false;
				io.sockets.in(req.roomNum).emit('endRoundResponse','error(no next round)');
			}else{
				allRooms.get(req.roomNum).isGaming = false;
				io.sockets.in(req.roomNum).emit('endRoundResponse','endRoundMessage');
			}
		}       
		catch(e){
			io.sockets.in(req.roomNum).emit('endRoundResponse','error')
		}
		
	});

	socket.on('shuffle',(req)=>{
		try{
			let thisRoom = allRooms.get(req.roomNum);
			thisRoom.Users.delete(req.teacherID)
			let roundNum = req.roundNum;
			let saleMax = thisRoom.round[roundNum].saleMax;
			let buyMax = thisRoom.round[roundNum].buyMax;
			let saleMin = thisRoom.round[roundNum].saleMin;
			let buyMin = thisRoom.round[roundNum].buyMin;
			let ratio =  thisRoom.round[roundNum].ratio/100;
			let total = thisRoom.Users.size; 
			let interval = thisRoom.interval;
			let restrict;//紀錄買家賣家何者較少
			let tcount = 0; //計已分配的總數量
			let rantmp = 0; //用來隨機分配的參數

			if(thisRoom.isGaming == true){
				io.sockets.in(req.roomNum).emit('shuffleResponse','error');
			}else{

				let sellerNum = Math.round(ratio * total)
				let buyerNum = total-sellerNum

				if(sellerNum>=buyerNum){
					restrict = buyerNum;
				}else{
					restrict = sellerNum;
				}
				// 分配身份的步驟：假設有12人 buyer:5 seller:7 
				// 1.先分配10個人分別五五買賣 2.再分配兩個seller
				thisRoom.Users.forEach(function(value,key) {
					
					//上述的步驟一在if內完成，步驟二在else內完成
					if(tcount<restrict*2){
						if(tcount%2==0){
							rantmp = Math.floor(Math.random() * 2)
						}
						switch(rantmp){
							case 0:
								money = Math.floor(Math.random() * (saleMax-saleMin) ) + saleMin
								money = interval * Math.ceil(money/interval)
								value.role = 'seller' 
								value.price = money 
								rantmp=1
								break;
							case 1:
								money = Math.floor(Math.random() * (buyMax-buyMin)) + buyMin
								money = interval * Math.ceil(money/interval)
								value.role = 'buyer' 
								value.price = money
								rantmp=0
								break;
						}
						tcount++;
						thisRoom.Users.set(key,value)
					}else{
						if(sellerNum>buyerNum){
							money = Math.floor(Math.random() * (saleMax-saleMin) ) + saleMin
							money = interval * Math.ceil(money/interval)
							value.role = 'seller' 
							value.price = money 
						}else{
							money = Math.floor(Math.random() * (buyMax-buyMin)) + buyMin
							money = interval * Math.ceil(money/interval)
							value.role = 'buyer' 
							value.price = money
							rantmp=0
						}
						
						tcount++;
						thisRoom.Users.set(key,value)
					}
				});
				thisRoom.total = thisRoom.total - 1
				allRooms.set(req.roomNum, thisRoom);
				io.sockets.in(req.roomNum).emit('shuffleResponse',{ userData: Array.from(thisRoom.Users)});
			}
		}catch(e){
			io.sockets.in(req.roomNum).emit('shuffleResponse','error');
		}
	});

	//===============高鵬雲部分====================//

	/*掃到 QR code
	 *回傳收錢者的 目前金額
	*/
	/*
	  app.post("/scanQRcode", function (req, res) {


	    var req_payer = req.body.user_id;//獲取收款人id
	    var thisRoom = allRooms.get(req.body.roomNum);//獲取房間id
	    var theseUsers = thisRoom.Users;//獲取房間所有user
	    var reciver_info = theseUsers.get(req_payer);//獲取收款人資料

	    res.json(reciver_info.money);
	  });*/

	//test
	socket.on('test', (data) => {
		socket.emit('testResponse', {s:"success"});
	});


	
  	/*
	*紀錄User建立connerction後的socket物件
	*/
	socket.on('setSocket', (data)=>{
		var thisRoom = allRooms.get(data.roomNum);//獲取房間id
		var allUsers = thisRoom.Users;//獲取所有Users
		var thisuser = allUsers.get(String(data.user_id));

		thisuser.socketID = socket.id;
		var s_id = thisuser.socketID;
		
		try{
			//test
			//var testid =  allUsers.get(String(234)).socketID;
			//socket.broadcast.to(testid).emit('testbroadcast', {msg:'hello!'});

			io.sockets.to(s_id).emit('testsocket',  {s:s_id});
		}       
		catch(e){
			io.sockets.to(s_id).emit('testsocket', 'error');
		}
			
	});

  	  

    /*交易確認要求
  	* socket版本
  	*/
	  socket.on('checkQRcode', (data) =>{
		  
		var thisRoom = allRooms.get(data.roomNum);//獲取房間id
		var allUsers = thisRoom.Users;//獲取所有Users
			
		var payer = allUsers.get(String(data.payer_id))//獲取付款者ID
		var payerSocket = payer.socketID;
		var receiver_id = data.receiver_id;
		  
		try{
			var thisRoom = allRooms.get(data.roomNum);//獲取房間id
			var allUsers = thisRoom.Users;//獲取所有Users
			
			var payer = allUsers.get(String(data.payer_id))//獲取付款者ID
			var payerSocket = payer.socketID;
			var receiver_id = data.receiver_id;
			
			io.sockets.to(payerSocket).emit('transCheckReq', receiver_id);
			
		}       
		catch(e){
			io.sockets.to(payerSocket).emit('transCheckReq','checkQRcode error')
		}
	

	});

	//聽取回應
	socket.on('get_chek_point', (data)=>{
		var thisRoom = allRooms.get(data.roomNum);//獲取房間id
		var allUsers = thisRoom.Users;//獲取所有Users

		var thisRound = data.round;//獲取本回合
		var money = data.money;//交易金額

		var payer = allUsers.get(data.payer_id);//獲取付款者ID	
		var receiver = allUsers.get(data.receiver_id);//獲取付款者ID
		var receiverSocket = receiver.socketID;
		
		try{
			var chek_point = data.chek_point;

			//交易成功寫入交易紀錄表
			if(chek_point==1){
				receiver.money += Number(money);
				payer.money -= Number(money);
				thisRoom.round[Number(thisRound)].record.push({seller: data.receiver_id, buyer: data.payer_id, price: money});
				socket.emit('getRecordRequest', thisRoom.round[thisRound].record);;
			}

			io.sockets.to(receiverSocket).emit('transcResp', chek_point);
		}
		catch(e){
			io.sockets.to(receiverSocket).emit('transcResp', 'get_chek_point error');
		}
        });
	
	/*
	*直接依ID匯款
	*/

	//付款方匯款發送要求，傳給收款方
	socket.on('send_transc_req', (data) =>{
			
		try{	
			var thisRoom = allRooms.get(data.roomNum);//獲取房間id

			if(thisRoom){
				var allUsers = thisRoom.Users;//獲取所有Users

				if(allUsers){
					var receiver = allUsers.get(String(data.receiver_id))//獲取付款者ID
					var receiverSocket = receiver.socketID;

					var money = data.transc_money;
					
					io.sockets.to(receiverSocket).emit('transCheckReq', {payer_id : data.payer_id, transc_money: money});		
				}
			}		
		}       
		catch(e){
			io.sockets.to(socket.id).emit('transc_error_handle','checkQRcode error')
		}
	});

	//聽取收款方收款
	socket.on('send_chek_point', (data) =>{

		try{
			var thisRoom = allRooms.get(data.roomNum);//獲取房間id

			if(thisRoom){
				var allUsers = thisRoom.Users;//獲取所有Users

				if(all_Users){
					var payer = allUsers.get(data.payer_id);//獲取付款者ID	
					var receiver = allUsers.get(data.receiver_id);//獲取付款者ID

					if(payer && receiver){
						//var receiverSocket = receiver.socketID;
						var payer_Socket = payer_socketID;
						var money = data.transc_money;//交易金額
						var chek_point = data.chek_point;
							
						//交易成功寫入交易紀錄表
						if(chek_point==1){
							receiver.money += Number(money);
							payer.money -= Number(money);
							thisRoom.round[Number(thisRound)].record.push({seller: data.receiver_id, buyer: data.payer_id, price: money});
							socket.emit('getRecordRequest', thisRoom.round[thisRound].record);;
						}

						io.sockets.to(payer_Socket).emit('payer_transcResp', chek_point);
						//io.sockets.to(receiverSocket).emit('receiver_transcResp', chek_point);
							
					}else{
						io.sockets.to(socket.id).emit('transc_error_handle', 'transc error');
					}
				}else{
					io.sockets.to(socket.id).emit('transc_error_handle', 'transc error');
				}
			}else{
				io.sockets.to(socket.id).emit('transc_error_handle', 'transc error');
			}
		}
		catch(e){
			//錯誤回傳
			io.sockets.to(socket.id).emit('transc_error_handle', 'transc error');
			try{				
				if(payer_Socket){
					io.sockets.to(payer_Socket).emit('transc_error_handle', 'transc error');
				}
			}
			catch(er){
				console(er);
			}
		}
	});


		
        //admin發送金錢
        socket.on('set_admin_transc_req', (data)=>{
                var thisRoom = allRooms.get(data.roomNum);//獲取房間id
                var allUsers = thisRoom.Users;//獲取所有Users

                var thisRound = data.round//獲取本回合
                var money = Number(data.money);//交易金額

                //var payer = data.payer_id//獲取付款者ID
		//var payer_money = allUsers.get(payer).money
                var receiver = allUsers.get(data.receiver_id);//獲取付款者ID
                var receiverSocket = receiver.socketID;
		
                var chek_point = 1;
		var used_times  = thisRoom.admin_transc_times;
                var limit_times = Number(data.limit_times);
		/*
		if(payer_money==0){
			allUsers.get(payer).money = 99999;
		}
		*/
                try {
                        if((used_times<limit_times) || (limit_times==-1)){
                                receiver.money += Number(money);
                                //thisRoom.round[Number(thisRound)].record.push({seller: data.receiver_id, buyer: data.payer_id, price: money});
                                io.sockets.to(receiverSocket).emit('get_admin_transc_rsp', { point:chek_point, round: thisRoom.round[Number(thisRound)] });
                                used_times+=1;
                        }
                        else{
                                chek_point = -1;
                                io.sockets.to(receiverSocket).emit('get_admin_transc_rsp',  { point:chek_point, round: thisRoom.round[Number(thisRound)] });
			}
                }
                catch(e){
                        chek_point = 0;
                        io.sockets.to(receiverSocket).emit('get_admin_transc_rsp',  { point:chek_point, round: thisRoom.round[Number(thisRound)] });
                }
                thisRoom.admin_transc_times = used_times;
        });

	

	
  	//test
	socket.on('faketransc', (data) => {
		try{
			var thisRoom = allRooms.get(data.roomNum);//獲取房間id
			var allUsers = thisRoom.Users;//獲取所有Users
	
			var thisRound = data.round//獲取本回合
			
			socket.emit('getRecordRequest', thisRoom.round[thisRound].record)
		
		}       
		catch(e){
			socket.emit('getRecordRequest','error')
		}
	});

	//公告訊息與changeRoleMoney////////
	socket.on('sendsysmsg', function(data) {
		try{
			let thisRoom = allRooms.get(data.roomNum);
			let msg = data.msg;
			let bPrice =  parseInt(data.bAdjustPrice);
			let sPrice =  parseInt(data.sAdjustPrice);
			let buyerMoneyData = [];
			let sellerMoneyData = [];
			//把User裡屬於該role的金額依序調整
			thisRoom.Users.forEach(function(value, key) {
				if(value.role=="buyer"){
					value.price += bPrice 
					buyerMoneyData.push(value.price);
				}else{
					value.price += sPrice
					sellerMoneyData.push(value.price);
				}
			});

			//利用buyerMoneyData和sellerMoneyData做成chartData
			buyerMoneyData.sort((a, b) => b - a);
			sellerMoneyData.sort((a, b) => a - b);

			let p = 0
			while (buyerMoneyData[p]-sellerMoneyData[p]>0){
				p++
			}

			tmpChartData.set(data.roomNum ,{buyer:buyerMoneyData,seller:sellerMoneyData,point:p})
			allRooms.set(data.roomNum, thisRoom);	

			io.sockets.in(data.roomNum).emit('sys', {message : msg,chartData: {buyer:buyerMoneyData,seller:sellerMoneyData,point:p}});
		}
		catch(e){
			io.sockets.in(data.roomNum).emit('sys','error')
		}	
	});

  /*交易確認要求
  *找payer
  *回傳付錢者回應
  */
 /*
  app.post("/checkQRcode", function (req, res, next) {

	var thisRoom = allRooms.get(req.body.transaction.get('roomNum'));//獲取房間id
	var allUsers = thisRoom.Users;

	var thisRound = req.body.transaction.get('round');
    var payer_id = req.body.transaction.get('payer');//獲取付款者IDcc
    var receiver_id = req.body.transaction.get('receiver');//獲取付款者ID
    var money = req.body.transaction.get('money');

    console.log("收到確認要求"+payer_id);

    //廣播搜尋
    socketIO.to(req.body.transaction.get('roomNum')).emit('search_user', payer_id);

    //聽取回應
    socket.on('get_chek_point', function(chek_point){

        console.log(chek_point)        
    
        //交易成功寫入交易紀錄表
        if(chek_point==='1'){
          allUsers.get(receiver_id).money += input_money;
		  allUsers.get(payer_id).money -= input_money;
          thisRoom.round[thisRound].record.push({seller: receiver_id, buyer: payer_id, price: money});
        }

         //回傳res
         res.send(chek_point);
    })

  });
*/
    	//交易紀錄要求
    
    socket.on('sendRecordRequest', function (data) {
		try{
				
			var thisRoom = allRooms.get(data.roomNum);//獲取房間id
			var thisRound = thisRoom.round[data.round];
			var thisrecord =  thisRound.record;

			//傳送交易紀錄
			socket.emit('getRecordRequest',{record:thisrecord});
		}       
		catch(e){
			socket.emit('getRecordRequest','error')
		}

	});
    
    	//獲取多回合交易紀錄
	socket.on('send_multiRecords_req', function(data) {
		try{
			var thisRoom = allRooms.get(data.roomNum);//獲取房間id
			var rods = data.round;
			var recds =  [];
			
			for(i=0; i<rods.length; i++){
				var  rec = thisRoom.round[Number(rods[i]-1)].record;
				recds.push(rec);
			};
			
			//傳送多回合交易紀錄
			socket.emit('getmultiRecordsResponse', recds);
		}
		catch(e){
			socket.emit('getmultiRecordsResponse', 'error');
		}
			
	});

	socket.on('set_fake_Error',function(data){
		if(Number(data)==1){
			throw new Error(`出錯了`);
		}
	});
	
	
	//============高鵬雲的部分結束=============//
});

// server.listen(3000, process.env.IP, function () {
// 	console.log("Server Start!");
// });
httpsServer.listen(3000, process.env.IP, function () {
	console.log("Server Start!");
});


// uncaughtException 最後一道防線。 
process.on('uncaughtException', function (err) {

	try{
		var now = new Date(); 
		var datetime = now.getFullYear()+'/'+(now.getMonth()+1)+'/'+now.getDate(); 
	      datetime += ' '+now.getHours()+':'+now.getMinutes()+':'+now.getSeconds(); 

		var error_message = util.format(datetime+'->'+err) + '\n'
		var log_file = fs.createWriteStream('debug.log', {flags : 'w'});
		var log_stdout = process.stdout;

		
			log_file.write(util.format(error_message) + '\n');
			log_stdout.write(util.format(error_message) + '\n');
		

	}catch(e){
		console.log(e);
	}
	
});

/*
房間暫存參數(Map):
		allRooms[房間ID:int]{
			round[]:{
					ratio: 買賣方比例，型態float
					initMoney: 初始金額，型態int
					saleMin: 賣價下限，型態int
					saleMax: 賣價上限，型態int
					buyMin: 買價下限，型態int
					buyMax: 買價上限，型態int
					interval: 價格區間，型態int
					item: 自創物品，例如排放權之類的，型態string
					records[]:所有交易紀錄，型態record
			}
			gameType: 遊戲類型，型態int
			roundTime: 回合時間，型態int
			roomName:房間名稱，型態string
			Users: 所有使用者，型態map
			nowRound: 現在第幾回合，型態int
			//以下資料庫才有
			active: false,
			nowRoomID: null
		}

		record{
			seller:賣家id，型態int
			buyer:買家id，型態int
			price:金額。型態int
		}

玩家暫存參數(Map):
		Users[學號:int]{
			username: 玩家名字，型態string
			role: 買賣身分，型態string
			money: 玩家錢，型態int
			price: 買賣價格，型態int
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
