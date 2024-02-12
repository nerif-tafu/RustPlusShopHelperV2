const { Server } = require('socket.io');
const io = new Server(3001, {
  cors: {
    origin: ["http://localhost:3000"]
  }
});

io.on("connection", (socket) => {
    console.log('Client connected to WS')
})