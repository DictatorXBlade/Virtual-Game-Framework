net = require('net');
fs = require('fs');
path = require('path');
spawn=require('child_process').spawn;
function Queue(i){ //circular queue of integers of size i
	var a=new Array(i),front=-1,back=-1;
	this.enqueue=function(data) {
		if (front==-1) { //queue is empty
			front=0;
			back=0;
			a[back]=data;
		}
		else if ((front==0 and back==i-1) or back==front-1) { //queue full
			;
		}
		else if (back==i-1) { //wrap around
			a[back]=data;
			back=0;
		}
		else { //regular case
			a[back]=data;
			++back;
		}
	}
	this.dequeue=function(data) {
		if (front==-1) { //queue is empty
			;
		}
		else if (front==back) { //queue has 1 element
			temp=a[front];
			front=-1;
			back=-1;
			return temp;
		}
		else if (front==i-1) { //wrap around
			temp=a[front];
			front=0;
			return temp;
		}
		else { //regular case
			temp=a[front];
			++front;
			return temp;
		}
	}
};
var connections = new Object();
//read all config data from file
var config = JSON.parse(fs.readFileSync(path.join(process.cwd(),'server_config.txt')).toString())
game_ids=Queue(config["Max_Games"])
for (i=0;i!=config["Max_Games"];++i) {
	game_ids.enqueue(i);
}
var game_table=new Object();
var play_game_map=new Object();
Object.length = function(obj) {
    var size = 0;
	var key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};
function game_inserter_output(i) {
	return function(data) {
		var split_data=data.split(" ")
		connections[split_data[0]].write(i.toString()+" "+split_data.slice(1,split_data.length).join(" "));
	}
}
function game_deleter(i) {
	return function(exitcode) {
		delete game_table[i]; //removes game from the table
		for (key in play_game_map) {
			var checker=play_game_map[key].indexOf(i)
			if (checker!=-1)
				play_game_map[key].splice(checker,1);
		}
		game_ids.enqueue(i); //return game id to the queue of available ids
	}
}
server=net.createServer(function (socket) {
	socket.name = socket.remoteAddress + ":" + socket.remotePort //gives socket a name
	//in the future, there should be a way to give a username(and maybe password)
	connections[socket.name]=socket //inserts socket into the table of players
	play_game_map[socket.name]=[] //the player is presently playing 0 games
	console.log(socket.name)
  // Handle incoming messages from connections.
  socket.on('data', function (data) {
	var local=data.toString().split(" ");
	if (local[0]=="0") { //game create command
		if (game_table.length==config["Max_Games"]||config["Max_Games_per_Player"]<=play_game_map[socket.name]) { //maximum number of games has already been created
			socket.write("REJECTED");
		}
		else {
			var args=local.slice(1,local.length);
			var idx=game_ids.dequeue();
			game_table.push(spawn(config["Game_Command"],args,
			{
				stdio : ['pipe','pipe','pipe']
			})); //add entry to the game table
			var proc_handle=game_table[game_table.length-1];
			socket.write("ACCEPTED");
			game_table[idx].on('exit',game_deleter(idx));
			game_table[idx].stdout.on('data',game_inserter_output(idx));
			//game_table[idx].stderr.on('data',game_inserter_output(idx)); //handling errors in games is for the future
		}
	}
	else if (local[0]=="1") { //game join command
		var game_id=parseInt(local[1])
		game_table[game_id].write(socket.name+" "+local.slice(2,local.length).join(" "));
		play_game_map[socket.name].push(game_id)
	}
	else if (local[0]=="2") { //game transmit command
		game_table[parseInt(local[1])].write(socket.name+" "+local.slice(2,local.length).join(" "));
	}
  });
 
  // Remove the client from the list when it leaves
  socket.on('end', function () {
    delete connections[socket.name];
	play_game_map[socket.name].forEach(function(entry){
		game_table[entry].write(socket.name+" DISCONNECTED"); //inform each game that this player has disconnected
	});
	delete play_game_map[socket.name];
  });
});
server.maxConnections=config["Max_Connections"];
server.listen(5000);
