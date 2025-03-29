// Simple module to export the Socket.IO instance to avoid circular dependencies
let io = null;

module.exports = {
    initialize: (socketIo) => {
        io = socketIo;
        
        // Setup socket events
        io.on('connection', (socket) => {
            console.log('Client connected to socket.io');
            
            socket.on('disconnect', () => {
                console.log('Client disconnected from socket.io');
            });
        });
        
        return io;
    },
    getIO: () => {
        return io;
    }
}; 