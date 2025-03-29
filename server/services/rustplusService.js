const fs = require('fs');
const path = require('path');
const RustPlus = require('@liamcottle/rustplus.js');
const socketInstance = require('../socketInstance');

let rustplusInstance = null;
let connectionStatus = {
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null,
  connecting: false,
  reconnectAttempt: 0,
  reconnectTimer: null,
  maxReconnectAttempts: 10,  // Maximum number of reconnect attempts
  connectionCheckTimer: null, // Timer for periodic connection checks
  lastSuccessfulCheck: null   // Timestamp of last successful check
};

// How often to check if connection is actually alive (5 seconds)
const CONNECTION_CHECK_INTERVAL = 5000;
// How long to wait before considering a connection dead (15 seconds)
const CONNECTION_TIMEOUT = 15000;

// Exponential backoff for reconnection (in milliseconds)
function getReconnectDelay() {
  // Start with 5 seconds, then 10, 20, 40, etc. up to a maximum of 5 minutes
  const baseDelay = 5000;
  const maxDelay = 5 * 60 * 1000; // 5 minutes
  const delay = Math.min(baseDelay * Math.pow(2, connectionStatus.reconnectAttempt), maxDelay);
  return delay;
}

/**
 * Initialize the RustPlus connection
 */
async function initializeRustPlus() {
  try {
    // Clear any existing reconnect timer
    if (connectionStatus.reconnectTimer) {
      clearTimeout(connectionStatus.reconnectTimer);
      connectionStatus.reconnectTimer = null;
    }
    
    // Clear any existing connection check timer
    if (connectionStatus.connectionCheckTimer) {
      clearInterval(connectionStatus.connectionCheckTimer);
      connectionStatus.connectionCheckTimer = null;
    }
    
    // Reset reconnection counter
    connectionStatus.reconnectAttempt = 0;
    connectionStatus.connecting = true;
    
    // Get server data from RPData.json
    const rpDataPath = path.join(__dirname, '..', 'RPData.json');
    
    if (!fs.existsSync(rpDataPath)) {
      connectionStatus.connected = false;
      connectionStatus.lastError = 'No server paired';
      connectionStatus.connecting = false;
      // Emit the updated status
      safeEmitStatus();
      return { success: false, error: 'No server paired' };
    }
    
    // Read server data
    const serverData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
    
    // Check if we have the minimum required data to connect
    if (!serverData.serverIP || !serverData.appPort || !serverData.steamID || !serverData.playerToken) {
      console.log('Incomplete server data, cannot connect:', Object.keys(serverData).join(', '));
      connectionStatus.connected = false;
      connectionStatus.lastError = 'No server paired or incomplete server data';
      connectionStatus.connecting = false;
      // Emit the updated status
      safeEmitStatus();
      return { success: false, error: 'Incomplete server data' };
    }
    
    // Check if token is nearing expiration (13 days old) and try to refresh proactively
    if (serverData.pairingDate) {
      const pairingDate = new Date(serverData.pairingDate);
      const now = new Date();
      const daysSincePairing = (now - pairingDate) / (1000 * 60 * 60 * 24);
      
      if (daysSincePairing > 13) { // Tokens expire after ~14 days
        console.log('Token is nearing expiration, attempting proactive refresh...');
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          // Token refreshed, reload the data
          serverData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
        }
      }
    }
    
    // Disconnect any existing connection
    if (rustplusInstance) {
      try {
        rustplusInstance.disconnect();
      } catch (error) {
        console.log('Error disconnecting existing instance:', error);
      }
    }
    
    // Create new RustPlus instance
    rustplusInstance = new RustPlus(
      serverData.serverIP,
      serverData.appPort,
      serverData.steamID,
      serverData.playerToken
    );
    
    // Connect to the server
    return new Promise((resolve) => {
      // Set a timeout to prevent hanging if connection fails
      let timeoutId = setTimeout(() => {
        connectionStatus.connected = false;
        connectionStatus.lastError = 'Connection timeout';
        connectionStatus.connecting = false;
        
        // Emit the updated status
        safeEmitStatus();
        
        // Schedule reconnection
        scheduleReconnect();
        
        resolve({ success: false, error: 'Connection timeout' });
      }, 30000); // 30 seconds timeout
      
      rustplusInstance.on('error', (error) => {
        clearTimeout(timeoutId);
        
        console.error('RustPlus connection error:', error);
        connectionStatus.connected = false;
        connectionStatus.lastError = error ? (error.message || 'Connection error') : 'Unknown connection error';
        connectionStatus.connecting = false;
        
        // Emit the updated status
        safeEmitStatus();
        
        // Schedule reconnection
        scheduleReconnect();
        
        resolve({ success: false, error: error.message });
      });
      
      rustplusInstance.on('connecting', () => {
        console.log('Connecting to Rust+ server...');
        connectionStatus.connecting = true;
        
        // Emit updated status indicating connection attempt
        safeEmitStatus();
      });
      
      rustplusInstance.on('connected', async () => {
        clearTimeout(timeoutId);
        
        console.log('Connected to Rust+ server');
        connectionStatus.connected = true;
        connectionStatus.lastConnected = new Date();
        connectionStatus.lastError = null; // Clear any previous errors
        connectionStatus.connecting = false;
        connectionStatus.reconnectAttempt = 0; // Reset reconnect attempts on successful connection
        connectionStatus.lastSuccessfulCheck = new Date(); // Initialize the check timestamp
        
        // Get server info
        try {
          const serverInfo = await getServerInfo();
          connectionStatus.serverInfo = serverInfo;
          
          // Emit the updated status with server info
          safeEmitStatus();
          
          // Start the periodic connection check
          startConnectionCheck();
          
          resolve({ success: true, data: { connected: true, serverInfo } });
        } catch (error) {
          console.error('Failed to get server info:', error);
          connectionStatus.connected = false;
          connectionStatus.lastError = error.message || 'Failed to get server info';
          connectionStatus.serverInfo = null;
          connectionStatus.connecting = false;
          
          // Emit the updated status with error
          safeEmitStatus();
          
          // Schedule reconnection
          scheduleReconnect();
          
          resolve({ success: false, error: error.message });
        }
      });
      
      rustplusInstance.on('message', (message) => {
        console.log('Message from Rust+ server:', message);
        
        // Check for error responses
        if (message.response && message.response.error) {
          const errorMessage = `Server error: ${message.response.error.error || 'unknown error'}`;
          connectionStatus.lastError = errorMessage;
          
          if (message.response.error.error === 'not_found') {
            connectionStatus.connected = false;
            connectionStatus.lastError = 'Invalid player token or server configuration';
            connectionStatus.connecting = false;
            
            // Check if we should attempt to refresh the token
            attemptTokenRefresh();
            
            // Emit the updated status
            safeEmitStatus();
          }
        }
      });
      
      // Handle disconnection
      rustplusInstance.on('disconnected', () => {
        console.log('Disconnected from Rust+ server');
        connectionStatus.connected = false;
        connectionStatus.connecting = false;
        
        safeEmitStatus();
      });
      
      // Start the connection
      rustplusInstance.connect();
    });
  } catch (error) {
    console.error('Failed to initialize RustPlus:', error);
    
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    connectionStatus.connecting = false;
    
    // Emit the updated status
    safeEmitStatus();
    
    // Schedule reconnection
    scheduleReconnect();
    
    return { success: false, error: error.message };
  }
}

/**
 * Schedule a reconnection attempt with exponential backoff
 */
function scheduleReconnect() {
  try {
    // Only schedule if there isn't already a reconnect timer
    if (connectionStatus.reconnectTimer) {
      return;
    }
    
    connectionStatus.reconnectAttempt++;
    
    // Check if we've reached the max reconnect attempts
    if (connectionStatus.reconnectAttempt > connectionStatus.maxReconnectAttempts) {
      console.log(`Reached maximum reconnect attempts (${connectionStatus.maxReconnectAttempts}), stopping reconnect`);
      return;
    }
    
    const delay = getReconnectDelay();
    console.log(`Scheduling reconnect attempt ${connectionStatus.reconnectAttempt} in ${delay/1000} seconds...`);
    
    connectionStatus.reconnectTimer = setTimeout(() => {
      connectionStatus.reconnectTimer = null;
      console.log(`Reconnect attempt ${connectionStatus.reconnectAttempt}`);
      initializeRustPlus();
    }, delay);
  } catch (error) {
    console.error('Error scheduling reconnect:', error);
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
    
    // Emit connection status to clients
    safeEmitStatus();
  });
  
  // Connection closed
  rustplusInstance.on('disconnected', () => {
    console.log('Disconnected from Rust+ server');
    
    connectionStatus.connected = false;
    
    // Emit connection status to clients
    safeEmitStatus();
  });
  
  // Error handling
  rustplusInstance.on('error', (error) => {
    console.error('RustPlus error:', error);
    
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    
    // Emit connection status to clients
    safeEmitStatus();
  });
  
  // Handle all messages
  rustplusInstance.on('message', (message) => {
    console.log('Message from Rust+ server:', message);
    
    // Handle broadcast messages (entity changed, etc.)
    if (message.broadcast) {
      handleBroadcast(message.broadcast);
    }
  });
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
 * Get the current connection status
 */
function getStatus() {
  // Create a sanitized copy of the status object
  const sanitizedStatus = {
    connected: connectionStatus.connected,
    connecting: connectionStatus.connecting,
    lastConnected: connectionStatus.lastConnected,
    lastError: connectionStatus.lastError,
    reconnectAttempt: connectionStatus.reconnectAttempt,
    serverInfo: connectionStatus.serverInfo
  };
  
  // Further sanitize the serverInfo to remove any potential circular references
  if (sanitizedStatus.serverInfo) {
    sanitizedStatus.serverInfo = {
      name: sanitizedStatus.serverInfo.name,
      map: sanitizedStatus.serverInfo.map,
      mapSize: sanitizedStatus.serverInfo.mapSize,
      wipeTime: sanitizedStatus.serverInfo.wipeTime,
      players: sanitizedStatus.serverInfo.players,
      maxPlayers: sanitizedStatus.serverInfo.maxPlayers,
      queuedPlayers: sanitizedStatus.serverInfo.queuedPlayers
    };
  }
  
  // Use JSON stringify/parse to ensure all circular references are removed
  try {
    return JSON.parse(JSON.stringify(sanitizedStatus));
  } catch (error) {
    console.error('Error stringifying status:', error);
    // Return a minimal status if the full one can't be stringified
    return {
      connected: connectionStatus.connected,
      connecting: connectionStatus.connecting,
      lastError: "Error creating status object"
    };
  }
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
 * Start periodic checking of the Rust+ connection
 */
function startConnectionCheck() {
  // Clear any existing timer
  if (connectionStatus.connectionCheckTimer) {
    clearInterval(connectionStatus.connectionCheckTimer);
  }
  
  // Set up the interval timer
  connectionStatus.connectionCheckTimer = setInterval(async () => {
    if (!rustplusInstance || !connectionStatus.connected) {
      // If already disconnected, no need to check
      return;
    }
    
    // Check if the last successful check is too old
    if (connectionStatus.lastSuccessfulCheck) {
      const now = new Date();
      const timeSinceLastCheck = now - connectionStatus.lastSuccessfulCheck;
      
      if (timeSinceLastCheck > CONNECTION_TIMEOUT) {
        console.log(`No successful connection check in ${CONNECTION_TIMEOUT/1000} seconds, considering connection dead`);
        handleDeadConnection();
        return;
      }
    }
    
    // Perform a connection check by requesting time (lightweight call)
    try {
      await checkConnectionAlive();
    } catch (error) {
      console.log(`Connection check failed: ${error.message}`);
      // Don't immediately disconnect on a single failure
      // The timeout check above will handle persistent failures
    }
  }, CONNECTION_CHECK_INTERVAL);
}

/**
 * Check if the connection is alive by requesting time from the server
 */
async function checkConnectionAlive() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance) {
      reject(new Error('No RustPlus instance'));
      return;
    }
    
    // Use checkSubscription as a lightweight heartbeat check
    rustplusInstance.sendRequest({
      checkSubscription: {}
    }, (message) => {
      if (message && message.response) {
        // Any response means the connection is alive
        connectionStatus.lastSuccessfulCheck = new Date();
        resolve(true);
        return true; // mark as handled
      } else {
        // No valid response
        reject(new Error('Invalid response from server'));
        return true; // mark as handled
      }
    });
    
    // Add a short timeout for this particular request
    setTimeout(() => {
      reject(new Error('Time request timed out'));
    }, 5000);
  });
}

/**
 * Handle a dead connection that wasn't properly disconnected
 */
function handleDeadConnection() {
  console.log('Detected dead connection, forcing disconnect');
  
  // Update connection status
  connectionStatus.connected = false;
  connectionStatus.lastError = 'Connection lost - server not responding';
  
  // Clean up the connection
  if (rustplusInstance) {
    try {
      rustplusInstance.disconnect();
    } catch (error) {
      console.log('Error disconnecting dead instance:', error);
    }
    rustplusInstance = null;
  }
  
  // Clear the connection check timer
  if (connectionStatus.connectionCheckTimer) {
    clearInterval(connectionStatus.connectionCheckTimer);
    connectionStatus.connectionCheckTimer = null;
  }
  
  // Notify clients
  safeEmitStatus();
  
  // Schedule reconnection
  scheduleReconnect();
}

/**
 * Attempt to refresh the player token using stored FCM credentials
 */
async function attemptTokenRefresh() {
  try {
    console.log('Attempting to refresh player token...');
    
    // Load the current RPData which should include the FCM credentials
    const rpDataPath = path.join(__dirname, '..', 'RPData.json');
    
    if (!fs.existsSync(rpDataPath)) {
      console.log('No server data file found. Cannot refresh token.');
      scheduleReconnect(); // Still try to reconnect with old token
      return false;
    }
    
    const serverData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
    
    // Check if we have the necessary FCM data
    if (!serverData.fcmCredentials || !serverData.lastPairingData) {
      console.log('Missing FCM credentials or pairing data. Cannot refresh token.');
      scheduleReconnect(); // Still try to reconnect with old token
      return false;
    }
    
    // Import the pairing service to use its functions
    const pairingService = require('./pairingService');
    
    // Attempt to re-pair using the stored FCM credentials
    const notification = await pairingService.listenForPairingNotification(
      serverData.fcmCredentials, 
      // Include serverId to speed up pairing for the same server
      serverData.lastPairingData.id
    );
    
    if (notification && notification.success) {
      // Extract the new player token
      const newPlayerToken = notification.data.playerToken;
      console.log('Successfully refreshed player token:', newPlayerToken);
      
      // Update the token in our data file
      serverData.playerToken = newPlayerToken;
      serverData.tokenRefreshedAt = new Date().toISOString();
      
      // Save back to the file
      fs.writeFileSync(rpDataPath, JSON.stringify(serverData, null, 2));
      
      // Re-initialize the connection with the new token
      initializeRustPlus();
      return true;
    } else {
      console.log('Failed to refresh token automatically:', notification?.error || 'Unknown error');
      scheduleReconnect(); // Still try to reconnect with old token
      return false;
    }
  } catch (error) {
    console.error('Error during token refresh:', error);
    scheduleReconnect(); // Still try to reconnect with old token
    return false;
  }
}

// Add this function to safely emit status
function safeEmitStatus() {
  try {
    const io = socketInstance.getIO();
    if (io) {
      const sanitizedStatus = getStatus();
      io.emit('rustplusStatus', sanitizedStatus);
    }
  } catch (error) {
    console.error('Error emitting status:', error.message);
  }
}

module.exports = {
  initializeRustPlus,
  getStatus,
  getTime,
  getMap,
  sendTeamMessage
}; 