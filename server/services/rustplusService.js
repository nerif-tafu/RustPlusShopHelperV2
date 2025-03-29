const fs = require('fs');
const path = require('path');
const RustPlus = require('@liamcottle/rustplus.js');
const socketInstance = require('../socketInstance');

let rustplusInstance = null;
let connectionStatus = {
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null
};
let checkSubscriptionInterval = null;
const CHECK_INTERVAL = 10000; // Check every 10 seconds

/**
 * Initialize the RustPlus connection
 */
async function initializeRustPlus() {
  try {
    // Get server data from RPData.json
    const rpDataPath = path.join(__dirname, '..', 'RPData.json');
    
    if (!fs.existsSync(rpDataPath)) {
      throw new Error('No server paired yet');
    }
    
    const serverData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
    
    // Disconnect if already connected
    if (rustplusInstance) {
      rustplusInstance.disconnect();
      // Clear any existing interval
      if (checkSubscriptionInterval) {
        clearInterval(checkSubscriptionInterval);
        checkSubscriptionInterval = null;
      }
    }
    
    // Create a new RustPlus instance
    rustplusInstance = new RustPlus(
      serverData.serverIP, 
      serverData.appPort, 
      serverData.steamID, 
      serverData.playerToken
    );
    
    // Set up event listeners
    setupEventListeners();
    
    // Connect to the Rust server
    rustplusInstance.connect();
    
    return { success: true, message: 'RustPlus initialization started' };
  } catch (error) {
    console.error('Failed to initialize RustPlus:', error);
    
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    
    return { success: false, error: error.message };
  }
}

/**
 * Set up event listeners for the RustPlus instance
 */
function setupEventListeners() {
  if (!rustplusInstance) return;
  
  // Connection established
  rustplusInstance.on('connected', async () => {
    console.log('Connected to Rust+ server');
    
    connectionStatus.connected = true;
    connectionStatus.lastConnected = new Date();
    connectionStatus.lastError = null;
    
    try {
      // Fetch server info
      const serverInfo = await getServerInfo();
      connectionStatus.serverInfo = serverInfo;
    } catch (error) {
      console.error('Failed to get server info:', error);
    }
    
    // Start periodic subscription check
    startSubscriptionCheck();
    
    // Emit connection status to clients
    const io = socketInstance.getIO();
    io.emit('rustplusStatus', getStatus());
  });
  
  // Connection closed
  rustplusInstance.on('disconnected', () => {
    console.log('Disconnected from Rust+ server');
    
    connectionStatus.connected = false;
    
    // Clear the check interval when disconnected
    if (checkSubscriptionInterval) {
      clearInterval(checkSubscriptionInterval);
      checkSubscriptionInterval = null;
    }
    
    // Emit connection status to clients
    const io = socketInstance.getIO();
    io.emit('rustplusStatus', getStatus());
  });
  
  // Error handling
  rustplusInstance.on('error', (error) => {
    console.error('RustPlus error:', error);
    
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    
    // Emit connection status to clients
    const io = socketInstance.getIO();
    io.emit('rustplusStatus', getStatus());
  });
  
  // Handle all messages
  rustplusInstance.on('message', (message) => {
    //console.log('Message from Rust+ server:', message);
    console.log('Message from Rust+')
    
    // Handle broadcast messages (entity changed, etc.)
    if (message.broadcast) {
      handleBroadcast(message.broadcast);
    }
  });
}

/**
 * Start periodic subscription check to keep connection alive and detect disconnects
 */
function startSubscriptionCheck() {
  // Clear any existing interval first
  if (checkSubscriptionInterval) {
    clearInterval(checkSubscriptionInterval);
  }
  
  // Set up new interval for checking subscription
  checkSubscriptionInterval = setInterval(async () => {
    if (!rustplusInstance || !connectionStatus.connected) {
      return;
    }
    
    try {
      console.log('Checking Rust+ subscription status...');
      
      // Send the checkSubscription request
      checkSubscription()
        .then(result => {
          // Subscription is still valid, connection is good
          if (result.success) {
            console.log('Rust+ subscription check successful');
            // Update lastConnected timestamp
            connectionStatus.lastConnected = new Date();
            
            // Emit updated status to clients to show connection is still alive
            const io = socketInstance.getIO();
            io.emit('rustplusStatus', getStatus());
          } else {
            console.warn('Rust+ subscription check failed, attempting to reconnect...');
            // Instead of immediate reconnect, we'll check if the socket is still connected
            if (!rustplusInstance.isConnected()) {
              reconnect();
            }
          }
        })
        .catch(error => {
          console.error('Rust+ subscription check error:', error);
          connectionStatus.lastError = error.message;
          
          // Emit the error status to clients
          const io = socketInstance.getIO();
          io.emit('rustplusStatus', getStatus());
          
          // If we get an error during the check, connection might be lost
          if (connectionStatus.connected && !rustplusInstance.isConnected()) {
            console.warn('Connection appears to be lost, attempting to reconnect...');
            reconnect();
          }
        });
    } catch (error) {
      console.error('Error during subscription check interval:', error);
      
      // Update and emit error status
      connectionStatus.lastError = error.message;
      const io = socketInstance.getIO();
      io.emit('rustplusStatus', getStatus());
    }
  }, CHECK_INTERVAL);
}

/**
 * Check subscription status with the Rust server
 */
async function checkSubscription() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance) {
      reject(new Error('RustPlus instance not initialized'));
      return;
    }
    
    // Send the checkSubscription request
    rustplusInstance.sendRequest({
      checkSubscription: {}
    }, (message) => {
      // The Rust server will respond with a message object
      // Any response means the connection is still alive
      console.log("Check subscription response received");
      resolve({ success: true });
      return true; // Mark message as handled
    });
    
    // Set a timeout in case the request doesn't get a response
    setTimeout(() => {
      reject(new Error('Subscription check timed out'));
    }, 5000);
  });
}

/**
 * Attempt to reconnect to the Rust server
 */
async function reconnect() {
  console.log('Attempting to reconnect to Rust+ server...');
  
  // First disconnect if we're still connected
  if (rustplusInstance) {
    rustplusInstance.disconnect();
  }
  
  // Wait a short time before reconnecting
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try to initialize again
  try {
    await initializeRustPlus();
  } catch (error) {
    console.error('Failed to reconnect to Rust+ server:', error);
    
    // Schedule another reconnect attempt
    setTimeout(reconnect, 10000); // Try again in 10 seconds
  }
}

/**
 * Handle broadcast messages from the Rust server
 */
function handleBroadcast(broadcast) {
  const io = socketInstance.getIO();
  
  // Entity changed broadcast (smart switches, alarms, etc.)
  if (broadcast.entityChanged) {
    io.emit('entityChanged', broadcast.entityChanged);
  }
  
  // Team changed broadcast
  if (broadcast.teamChanged) {
    io.emit('teamChanged', broadcast.teamChanged);
  }
  
  // Map markers updated broadcast
  if (broadcast.mapMarkers) {
    io.emit('mapMarkersUpdated', broadcast.mapMarkers);
  }
}

/**
 * Get server info from the Rust server
 */
async function getServerInfo() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getInfo((message) => {
      if (message.response && message.response.info) {
        resolve(message.response.info);
      } else {
        reject(new Error('Failed to get server info'));
      }
    });
  });
}

/**
 * Get the current status of the RustPlus connection
 */
function getStatus() {
  return {
    connected: connectionStatus.connected,
    lastConnected: connectionStatus.lastConnected,
    lastError: connectionStatus.lastError,
    serverInfo: connectionStatus.serverInfo
  };
}

/**
 * Get the current time from the Rust server
 */
async function getTime() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getTime((message) => {
      if (message.response && message.response.time) {
        resolve(message.response.time);
      } else {
        reject(new Error('Failed to get time'));
      }
    });
  });
}

/**
 * Get the map from the Rust server
 */
async function getMap() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getMap((message) => {
      if (message.response && message.response.map) {
        resolve(message.response.map);
      } else {
        reject(new Error('Failed to get map'));
      }
    });
  });
}

/**
 * Send a message to the team chat
 */
async function sendTeamMessage(message) {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.sendTeamMessage(message, (response) => {
      if (response.response && response.response.ok) {
        resolve({ success: true });
      } else {
        reject(new Error('Failed to send team message'));
      }
    });
  });
}

/**
 * Get the map markers from the Rust server
 */
async function getMapMarkers() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getMapMarkers((message) => {
      console.log('Received map markers response');
      if (message.response && message.response.mapMarkers) {
        const markers = message.response.mapMarkers.markers || [];
        console.log(`Found ${markers.length} total markers`);
        
        // Count vending machines
        const vendingMachines = markers.filter(m => m.type === 3);
        console.log(`Found ${vendingMachines.length} vending machines`);
        
        // Log marker types for debugging
        const markerTypes = {};
        markers.forEach(marker => {
          markerTypes[marker.type] = (markerTypes[marker.type] || 0) + 1;
        });
        console.log('Marker types distribution:', markerTypes);
        
        // Log a sample of vending machine names
        if (vendingMachines.length > 0) {
          console.log('Sample vending machine names:');
          vendingMachines.slice(0, 3).forEach(vm => {
            console.log(` - ${vm.name}`);
            console.log('  Full marker data:', JSON.stringify(vm));
          });
        }
        
        resolve(message.response.mapMarkers);
      } else {
        console.log('Failed to get map markers - response format unexpected');
        console.log(JSON.stringify(message));
        reject(new Error('Failed to get map markers'));
      }
    });
  });
}

module.exports = {
  initializeRustPlus,
  getStatus,
  getTime,
  getMap,
  sendTeamMessage,
  checkSubscription,
  getMapMarkers
}; 