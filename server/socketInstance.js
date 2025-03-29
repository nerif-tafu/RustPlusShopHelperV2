// Simple module to export the Socket.IO instance to avoid circular dependencies
let io;

module.exports = {
    initialize: function(socketIo) {
        io = socketIo;
        return io;
    },
    getIO: function() {
        return io;
    }
}; 