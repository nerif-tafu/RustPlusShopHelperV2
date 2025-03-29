const { main } = require('./extractRustAssets');

// Get socket.io instance if available
let io;
try {
  io = require('../socketInstance').getIO();
} catch (error) {
  console.warn('Socket.IO not available, progress updates will not be sent');
}

// Run the extraction process
main(io)
  .then(result => {
    console.log('Download completed:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Download failed:', error);
    process.exit(1);
  });