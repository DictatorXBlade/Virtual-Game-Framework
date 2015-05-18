net = require('net');
fs = require('fs');
path = require('path');
var connections = [];
//read maximum connections from file
var max_conn = parseInt(fs.readFileSync(path.join(process.cwd(),'config.txt')).toString(),10)

net.createServer(function (socket) {
  if (connections.length>=max_conn) {
	  socket.destroy();
	  return;
  }
  else {
	  socket.name = socket.remoteAddress + ":" + socket.remotePort 
	  connections.push(socket)
	  socket.write("Hello "+socket.name)
	  console.log(socket.name)
  }
 
  // Handle incoming messages from connections.
  socket.on('data', function (data) {
    fs.appendFile(path.join(process.cwd()+socket.name+'.txt'),data,function(err) {});
  });
 
  // Remove the client from the list when it leaves
  socket.on('end', function () {
    connections.splice(connections.indexOf(socket), 1);
  });
}).listen(5000);
