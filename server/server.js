const { Server } = require("socket.io");
const io = new Server(3001, {
  cors: {
    origin: ["http://localhost:3000"]
  }
});

let sockets = [];

io.on("connection", (socket) => {
  console.log("Client connected to WS")

  socket.on("disconnect", () => {
    sockets = sockets.filter( _socket => _socket !== socket );
  });

  sockets.push(socket);
  serverConnectionUpdate();

  socket.on('clntNewServer', data => {
    connectToRustPlus(data.serverIP, data.appPort, data.steamID, data.playerToken);
  });
})

function serverConnectionUpdate(){
  sockets.forEach(socket => {
    socket.emit("svrRPConnect", lastServerStatus);
  });
}

// This is not used for processing the data, mearly as a ping-pong system.
setInterval(() => {
  if (rustplus?.websocket?.readyState) {
    rustplus.sendRequestAsync({
      getMapMarkers: {},
    }, 5000).catch(() => {
      rustplus.disconnect();
    })
  }

  io.emit('svrPingPong', {"connectionStatus":(rustplus?.websocket?.readyState), "date": new Date }) 
}, 5000)

/// RUST PLUS

const RustPlus = require("@liamcottle/rustplus.js");
let rustplus;
let lastServerStatus = { connectionStatus: 'disconnected', serverName: '' };

connectToRustPlus("190.21.58.40", "28083", "76561198056409776", "-1057216245");

// Server Init
function connectToRustPlus(serverIP, appPort, steamID, playerToken){
  if (rustplus?.isConnected()) { rustplus.disconnect() }
  rustplus = new RustPlus(serverIP, appPort, steamID, playerToken);
  setupRustPlusListeners();
  rustplus.connect();
  console.log('Starting connection to', serverIP);
}

function setupRustPlusListeners (){
  lastServerStatus = { connectionStatus: 'disconnected', serverName: '' };

  rustplus.on("connecting", () => {
    console.log('Connecting to Rust+ server.')
    lastServerStatus = { connectionStatus: 'connecting', serverName: 'cl.hophop.tech' };
    serverConnectionUpdate();
  });

  rustplus.on("connected", () => {
    console.log('Connected to Rust+ server.')
    lastServerStatus = { connectionStatus: 'connected', serverName: 'cl.hophop.tech' };
    serverConnectionUpdate();
  });

  rustplus.on("disconnected", () => {
    console.log('Disconnected from Rust+ server.')
    lastServerStatus = { connectionStatus: 'error', serverName: 'cl.hophop.tech' };
    serverConnectionUpdate();
  });

  rustplus.on("error", (error) => {
    if ( error.code === 'ETIMEDOUT' ) {
      rustplus.disconnect();
      console.log('Error from Rust+ server.')
      lastServerStatus = { connectionStatus: 'error', serverName: 'cl.hophop.tech' };
      serverConnectionUpdate();
    }
  });

  rustplus.on("message", message => {
    if ( message.response && message.response.mapMarkers ) {
      console.log(message.response.mapMarkers);
    }
  });
}
