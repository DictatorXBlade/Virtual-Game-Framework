net = require('net');
fs = require('fs');
path = require('path');
spawn=require('child_process').spawn;
readline=require('readline');
function Queue(i){ //circular queue of integers of size i
	this.a=new Array(i);
	this.front=-1;
	this.back=-1;
	this.enqueue=function(data) {
		if (this.front==-1) { //queue is empty
			this.front=0;
			this.back=0;
			this.a[this.back]=data;
		}
		else if ((this.front==0 && this.back==i-1) || this.back==this.front-1) { //queue full
			;
		}
		else if (this.back==i-1) { //wrap around
			this.back=0;
			this.a[this.back]=data;
		}
		else { //regular case
			++this.back;
			this.a[this.back]=data;
		}
	}
	this.dequeue=function(data) {
		if (this.front==-1) { //queue is empty
			return null;
		}
		else if (this.front==this.back) { //queue has 1 element
			temp=this.a[this.front];
			this.front=-1;
			this.back=-1;
			return temp;
		}
		else if (this.front==i-1) { //wrap around
			temp=this.a[this.front];
			this.front=0;
			return temp;
		}
		else { //regular case
			temp=this.a[this.front];
			++this.front;
			return temp;
		}
	}
	this.empty=function() {
		if (this.front==-1) {
			return true;
		}
		else {
			return false;
		}
	}
};
var connections = new Object();
//read all config data from file
var config = JSON.parse(fs.readFileSync(path.join(process.cwd(),'server_config.txt')).toString())
var game_ids=new Queue(config["Max_Games"])
for (i=0;i!=config["Max_Games"];++i) {
	game_ids.enqueue(i);
}
var game_table=new Object();
var play_game_map=new Object();
/*Object.length = function(obj) {
    var size = 0;
	var key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};*/
function game_inserter_output(i) {
	return function(data) { //sends data from game i to the player who is first part of string(no spaces)
		var split_data=data.toString().split(" ");
		connections[split_data[0]].write(i.toString()+" "+split_data.slice(1,split_data.length).join(" ")+"\r\n");
	}
}
function game_deleter(i) {
	return function(exitcode) {
		delete game_table[i.toString()]; //removes game from the table
		for (key in play_game_map) { //removes game from all players who were in the game
			var checker=play_game_map[key].indexOf(i)
			if (checker!=-1)
				play_game_map[key].splice(checker,1);
		}
		game_ids.enqueue(i); //return game id to the queue of available ids
	}
}
server=net.createServer(function (socket) {
	socket.name = socket.remoteAddress + ":" + socket.remotePort //gives socket a name
	socket.write("Hello "+socket.name+"\r\n")
	//in the future, there should be a way to give a username(and maybe password)
	connections[socket.name]=socket //inserts socket into the table of players
	play_game_map[socket.name]=[] //the player is presently playing 0 games
  // Handle incoming messages from connections.
  socket.on('data', function (data) {
	var local=data.toString().split(" ");
	var command=parseInt(local[0])
	if (command==0) { //game create command
		if (game_ids.empty()||config["Max_Games_per_Player"]==play_game_map[socket.name].length) { //maximum number of games has already been created
			socket.write("REJECTED");
		}
		else {
			var args=local.slice(1,local.length); //command line args(usually clauses, and the host player's state) for the game
			args.unshift(socket.name)
			var idx=game_ids.dequeue();
			play_game_map[socket.name].push(idx);
			game_table[idx]=spawn(config["Game_Command"],args,
			{
				stdio : ['pipe','pipe','pipe']
			}); //add entry to the game table.
			socket.write("ACCEPTED");
			game_table[idx].on('exit',game_deleter(idx));
			rl=readline.createInterface({input : game_table[idx].stdout , output : null});
			rl.on('line',game_inserter_output(idx));
			//game_table[idx].stdout.on('data',game_inserter_output(idx));
			//game_table[idx].stderr.on('data',game_inserter_output(idx)); //handling errors in games is for the future
		}
	}
	else if (command==1) { //game join command
		game_id=parseInt(local[1])
		if (game_id in game_table && play_game_map[socket.name].length<config["Max_Games_per_Player"]&&play_game_map[socket.name].indexOf(game_id)==-1) {
			//if the game actually exists, the player hasn't exceeded quota, and the player isn't already in the game
			socket.write("ACCEPTED")
			game_table[game_id].stdin.write(socket.name+" "+local.slice(2,local.length).join(" "));
			play_game_map[socket.name].push(game_id)
		}
		else {
			socket.write("REJECTED");
		}
	}
	else if (command==2) { //game transmit command
		var game_id=parseInt(local[1])
		if (game_id in game_table && play_game_map[socket.name].indexOf(game_id)!=-1) { //if the game actually exists, and the player is part of it
			game_table[game_id].stdin.write(socket.name+" "+local.slice(2,local.length).join(" "));
		}
	}
  });
 
  // Remove the client from the list when it leaves
  socket.on('end', function () {
    delete connections[socket.name];
	play_game_map[socket.name].forEach(function(entry){
		game_table[entry].stdin.write(socket.name+" DISCONNECTED"); //inform each game that this player has disconnected
	});
	delete play_game_map[socket.name];
  });
});
server.maxConnections=config["Max_Connections"];
server.listen(5000);
