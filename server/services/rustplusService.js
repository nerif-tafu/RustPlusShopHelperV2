const fs = require('fs');
const path = require('path');
const RustPlus = require('@liamcottle/rustplus.js');
const socketInstance = require('../socketInstance');
const rustAssetManager = require('./RustAssetManager');
const pairingService = require('./pairingService');

let rustplusInstance = null;
let connectionStatus = {
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null,
  mapMarkers: null
};
// Configurable notification delay (ms)
let undercutNotificationDelayMs = 1000; // default 1s

function setUndercutNotificationDelay(seconds) {
  // clamp 0.5 - 5 seconds
  const clamped = Math.max(0.5, Math.min(5, Number(seconds) || 1));
  undercutNotificationDelayMs = Math.round(clamped * 1000);
}

function getUndercutNotificationDelaySec() {
  return undercutNotificationDelayMs / 1000;
}

// Track last announced undercuts to avoid duplicate notifications
const announcedUndercutKeys = new Set();

// Keep last computed undercuts for summary replies
let lastUndercutItems = [];

// Track last seen stock per ally shop item to detect out-of-stock transitions
// key format: `${shopId}::${itemId}::${currencyId}` -> number (amountInStock)
const lastStockByItemKey = new Map();

// Helper to build a stable undercut key
function makeUndercutKey(allyShopId, itemId, currencyId) {
  return `${allyShopId}::${itemId}::${currencyId}`;
}

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
  
  // Connection in progress
  rustplusInstance.on('connecting', () => {
    console.log('Connecting to Rust+ server...');
    connectionStatus.connected = false;
    connectionStatus.lastError = null;
  });
  
  // Connection established
  rustplusInstance.on('connected', onConnected);
  
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
    
    // Attempt automatic reconnection after a delay
    setTimeout(async () => {
      console.log('Attempting automatic reconnection...');
      try {
        await initializeRustPlus();
      } catch (error) {
        console.error('Automatic reconnection failed:', error);
      }
    }, 5000); // Wait 5 seconds before attempting reconnection
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
  
  // Server info received
  rustplusInstance.on('serverInfo', (serverInfo) => {
    console.log('Received server info:', serverInfo);
    connectionStatus.serverInfo = serverInfo;
    
    // Emit server info to clients
    const io = socketInstance.getIO();
    io.emit('serverInfo', serverInfo);
  });
  
  // Map markers received
  rustplusInstance.on('mapMarkers', (mapMarkers) => {
    if (mapMarkers && mapMarkers.markers) {
      connectionStatus.mapMarkers = mapMarkers;
      
      // Emit map markers to clients
      const io = socketInstance.getIO();
      io.emit('mapMarkers', mapMarkers);
    }
  });
  
  // Handle AppMessage responses (for map markers and other responses)
  rustplusInstance.on('message', (message) => {
    // Check if this is a map markers response
    if (message && message.response && message.response.mapMarkers) {
      connectionStatus.mapMarkers = message.response.mapMarkers;
      
      // Emit map markers to clients
      const io = socketInstance.getIO();
      io.emit('mapMarkers', message.response.mapMarkers);
    }

    // Detect team chat '!undercut' via generic message stream
    try {
      const r = message?.response;
      const candidate = message?.broadcast?.teamMessage?.message || r?.broadcast?.teamMessage?.message || r?.teamMessage?.message;
      let text = '';
      if (typeof candidate === 'string') {
        text = candidate;
      } else if (candidate && typeof candidate.message === 'string') {
        text = candidate.message;
      } else if (candidate && candidate.message != null) {
        text = String(candidate.message);
      }
      const lower = text && text.trim().toLowerCase();
      if (lower === '!undercut') {
        console.log('Detected !undercut command from team chat');
        const lines = buildUndercutSummaryForTeamLines();
        if (lines && lines.length > 0) {
          sendTeamMessagesSequential(lines);
        } else if (rustplusInstance) {
          rustplusInstance.sendTeamMessage('No current undercuts detected.', () => {});
        }
      } else if (lower === '!stock') {
        console.log('Detected !stock command from team chat');
        const lines = buildOutOfStockSummaryLines();
        if (lines && lines.length > 0) {
          sendTeamMessagesSequential(lines);
        } else if (rustplusInstance) {
          rustplusInstance.sendTeamMessage('No out-of-stock items found.', () => {});
        }
      }
    } catch {}
  });
  
  // Team message received
  rustplusInstance.on('teamMessage', (message) => {
    console.log('Received team message:', message);
    
    // Emit team message to clients
  const io = socketInstance.getIO();
    io.emit('teamMessage', message);

    try {
      const text = message?.message?.message?.toString()?.trim() || '';
      if (!text) return;
      const lower = text.toLowerCase();
      // Simple command: !undercut → reply with undercut summary
      if (lower === '!undercut') {
        const summary = buildUndercutSummaryForTeamLines();
        if (summary && summary.length > 0) {
          sendTeamMessagesSequential(summary);
        } else {
          rustplusInstance.sendTeamMessage('No current undercuts detected.', () => {});
        }
      } else if (lower === '!stock') {
        const lines = buildOutOfStockSummaryLines();
        if (lines && lines.length > 0) {
          sendTeamMessagesSequential(lines);
        } else {
          rustplusInstance.sendTeamMessage('No out-of-stock items found.', () => {});
        }
      }
    } catch (e) {
      console.warn('Failed handling team command:', e);
    }
  });
  
  // Smart alarm triggered
  rustplusInstance.on('smartAlarm', (alarm) => {
    console.log('Smart alarm triggered:', alarm);
    
    // Emit smart alarm to clients
    const io = socketInstance.getIO();
    io.emit('smartAlarm', alarm);
  });
  
  // Camera events (no logging)
  const cameraEvents = [
    'cameraFeed', 'cameraSwitch', 'cameraUse', 'cameraDestroy', 'cameraMove',
    'cameraInput', 'cameraOutput', 'cameraRename', 'cameraAuth', 'cameraDeauth',
    'cameraLock', 'cameraUnlock', 'cameraToggle', 'cameraOn', 'cameraOff',
    'cameraReset', 'cameraRestart', 'cameraShutdown', 'cameraSleep', 'cameraWake',
    'cameraHibernate', 'cameraResume', 'cameraPause', 'cameraPlay', 'cameraStop',
    'cameraRecord', 'cameraSnapshot', 'cameraZoom', 'cameraPan', 'cameraTilt',
    'cameraRotate', 'cameraFlip', 'cameraMirror', 'cameraInvert', 'cameraNormalize',
    'cameraThreshold', 'cameraBlur', 'cameraSharpen', 'cameraEdge', 'cameraEmboss',
    'cameraEngrave', 'cameraFindEdges', 'cameraRidge', 'cameraShade', 'cameraSolarize',
    'cameraSpread', 'cameraSwirl', 'cameraWave', 'cameraWind', 'cameraOilPaint',
    'cameraPosterize', 'cameraSepia', 'cameraSketch', 'cameraStamp', 'cameraTile',
    'cameraTwirl', 'cameraWater', 'cameraWood', 'cameraXray', 'cameraYuv', 'cameraZscale'
  ];
  
  cameraEvents.forEach(eventName => {
    rustplusInstance.on(eventName, (data) => {
      // Emit camera event to clients (no logging)
      const io = socketInstance.getIO();
      io.emit(eventName, data);
    });
  });
  
  // Camera toggle received
  rustplusInstance.on('cameraToggle', (toggleData) => {
    // Emit camera toggle to clients
    const io = socketInstance.getIO();
    io.emit('cameraToggle', toggleData);
  });
  
  // Camera on received
  rustplusInstance.on('cameraOn', (onData) => {
    // Emit camera on to clients
    const io = socketInstance.getIO();
    io.emit('cameraOn', onData);
  });
  
  // Camera off received
  rustplusInstance.on('cameraOff', (offData) => {
    // Emit camera off to clients
    const io = socketInstance.getIO();
    io.emit('cameraOff', offData);
  });
  
  // Camera reset received
  rustplusInstance.on('cameraReset', (resetData) => {
    // Emit camera reset to clients
            const io = socketInstance.getIO();
    io.emit('cameraReset', resetData);
  });
  
  // Camera restart received
  rustplusInstance.on('cameraRestart', (restartData) => {
    // Emit camera restart to clients
          const io = socketInstance.getIO();
    io.emit('cameraRestart', restartData);
  });
  
  // Camera shutdown received
  rustplusInstance.on('cameraShutdown', (shutdownData) => {
    // Emit camera shutdown to clients
    const io = socketInstance.getIO();
    io.emit('cameraShutdown', shutdownData);
  });
  
  // Camera sleep received
  rustplusInstance.on('cameraSleep', (sleepData) => {
    // Emit camera sleep to clients
      const io = socketInstance.getIO();
    io.emit('cameraSleep', sleepData);
  });
  
  // Camera wake received
  rustplusInstance.on('cameraWake', (wakeData) => {
    // Emit camera wake to clients
    const io = socketInstance.getIO();
    io.emit('cameraWake', wakeData);
  });
  
  // Camera hibernate received
  rustplusInstance.on('cameraHibernate', (hibernateData) => {
    // Emit camera hibernate to clients
    const io = socketInstance.getIO();
    io.emit('cameraHibernate', hibernateData);
  });
  
  // Camera resume received
  rustplusInstance.on('cameraResume', (resumeData) => {
    // Emit camera resume to clients
    const io = socketInstance.getIO();
    io.emit('cameraResume', resumeData);
  });
  
  // Camera pause received
  rustplusInstance.on('cameraPause', (pauseData) => {
    // Emit camera pause to clients
    const io = socketInstance.getIO();
    io.emit('cameraPause', pauseData);
  });
  
  // Camera play received
  rustplusInstance.on('cameraPlay', (playData) => {
    // Emit camera play to clients
    const io = socketInstance.getIO();
    io.emit('cameraPlay', playData);
  });
  
  // Camera stop received
  rustplusInstance.on('cameraStop', (stopData) => {
    // Emit camera stop to clients
    const io = socketInstance.getIO();
    io.emit('cameraStop', stopData);
  });
  
  // Camera record received
  rustplusInstance.on('cameraRecord', (recordData) => {
    // Emit camera record to clients
    const io = socketInstance.getIO();
    io.emit('cameraRecord', recordData);
  });
  
  // Camera snapshot received
  rustplusInstance.on('cameraSnapshot', (snapshotData) => {
    // Emit camera snapshot to clients
    const io = socketInstance.getIO();
    io.emit('cameraSnapshot', snapshotData);
  });
  
  // Camera zoom received
  rustplusInstance.on('cameraZoom', (zoomData) => {
    // Emit camera zoom to clients
  const io = socketInstance.getIO();
    io.emit('cameraZoom', zoomData);
  });
  
  // Camera pan received
  rustplusInstance.on('cameraPan', (panData) => {
    // Emit camera pan to clients
    const io = socketInstance.getIO();
    io.emit('cameraPan', panData);
  });
  
  // Camera tilt received
  rustplusInstance.on('cameraTilt', (tiltData) => {
    // Emit camera tilt to clients
    const io = socketInstance.getIO();
    io.emit('cameraTilt', tiltData);
  });
  
  // Camera rotate received
  rustplusInstance.on('cameraRotate', (rotateData) => {
    // Emit camera rotate to clients
    const io = socketInstance.getIO();
    io.emit('cameraRotate', rotateData);
  });
  
  // Camera flip received
  rustplusInstance.on('cameraFlip', (flipData) => {
    // Emit camera flip to clients
    const io = socketInstance.getIO();
    io.emit('cameraFlip', flipData);
  });
  
  // Camera mirror received
  rustplusInstance.on('cameraMirror', (mirrorData) => {
    // Emit camera mirror to clients
    const io = socketInstance.getIO();
    io.emit('cameraMirror', mirrorData);
  });
  
  // Camera invert received
  rustplusInstance.on('cameraInvert', (invertData) => {
    // Emit camera invert to clients
    const io = socketInstance.getIO();
    io.emit('cameraInvert', invertData);
  });
  
  // Camera normalize received
  rustplusInstance.on('cameraNormalize', (normalizeData) => {
    // Emit camera normalize to clients
    const io = socketInstance.getIO();
    io.emit('cameraNormalize', normalizeData);
  });
  
  // Camera threshold received
  rustplusInstance.on('cameraThreshold', (thresholdData) => {
    // Emit camera threshold to clients
    const io = socketInstance.getIO();
    io.emit('cameraThreshold', thresholdData);
  });
  
  // Camera blur received
  rustplusInstance.on('cameraBlur', (blurData) => {
    console.log('Camera blur received:', blurData);
    
    // Emit camera blur to clients
    const io = socketInstance.getIO();
    io.emit('cameraBlur', blurData);
  });
  
  // Camera sharpen received
  rustplusInstance.on('cameraSharpen', (sharpenData) => {
    console.log('Camera sharpen received:', sharpenData);
    
    // Emit camera sharpen to clients
    const io = socketInstance.getIO();
    io.emit('cameraSharpen', sharpenData);
  });
  
  // Camera edge received
  rustplusInstance.on('cameraEdge', (edgeData) => {
    console.log('Camera edge received:', edgeData);
    
    // Emit camera edge to clients
    const io = socketInstance.getIO();
    io.emit('cameraEdge', edgeData);
  });
  
  // Camera emboss received
  rustplusInstance.on('cameraEmboss', (embossData) => {
    console.log('Camera emboss received:', embossData);
    
    // Emit camera emboss to clients
    const io = socketInstance.getIO();
    io.emit('cameraEmboss', embossData);
  });
  
  // Camera engrave received
  rustplusInstance.on('cameraEngrave', (engraveData) => {
    console.log('Camera engrave received:', engraveData);
    
    // Emit camera engrave to clients
    const io = socketInstance.getIO();
    io.emit('cameraEngrave', engraveData);
  });
  
  // Camera find edges received
  rustplusInstance.on('cameraFindEdges', (findEdgesData) => {
    console.log('Camera find edges received:', findEdgesData);
    
    // Emit camera find edges to clients
    const io = socketInstance.getIO();
    io.emit('cameraFindEdges', findEdgesData);
  });
  
  // Camera ridge received
  rustplusInstance.on('cameraRidge', (ridgeData) => {
    console.log('Camera ridge received:', ridgeData);
    
    // Emit camera ridge to clients
    const io = socketInstance.getIO();
    io.emit('cameraRidge', ridgeData);
  });
  
  // Camera shade received
  rustplusInstance.on('cameraShade', (shadeData) => {
    console.log('Camera shade received:', shadeData);
    
    // Emit camera shade to clients
    const io = socketInstance.getIO();
    io.emit('cameraShade', shadeData);
  });
  
  // Camera solarize received
  rustplusInstance.on('cameraSolarize', (solarizeData) => {
    console.log('Camera solarize received:', solarizeData);
    
    // Emit camera solarize to clients
    const io = socketInstance.getIO();
    io.emit('cameraSolarize', solarizeData);
  });
  
  // Camera spread received
  rustplusInstance.on('cameraSpread', (spreadData) => {
    console.log('Camera spread received:', spreadData);
    
    // Emit camera spread to clients
    const io = socketInstance.getIO();
    io.emit('cameraSpread', spreadData);
  });
  
  // Camera swirl received
  rustplusInstance.on('cameraSwirl', (swirlData) => {
    console.log('Camera swirl received:', swirlData);
    
    // Emit camera swirl to clients
    const io = socketInstance.getIO();
    io.emit('cameraSwirl', swirlData);
  });
  
  // Camera wave received
  rustplusInstance.on('cameraWave', (waveData) => {
    console.log('Camera wave received:', waveData);
    
    // Emit camera wave to clients
    const io = socketInstance.getIO();
    io.emit('cameraWave', waveData);
  });
  
  // Camera wind received
  rustplusInstance.on('cameraWind', (windData) => {
    console.log('Camera wind received:', windData);
    
    // Emit camera wind to clients
    const io = socketInstance.getIO();
    io.emit('cameraWind', windData);
  });
  
  // Camera oil paint received
  rustplusInstance.on('cameraOilPaint', (oilPaintData) => {
    console.log('Camera oil paint received:', oilPaintData);
    
    // Emit camera oil paint to clients
    const io = socketInstance.getIO();
    io.emit('cameraOilPaint', oilPaintData);
  });
  
  // Camera posterize received
  rustplusInstance.on('cameraPosterize', (posterizeData) => {
    console.log('Camera posterize received:', posterizeData);
    
    // Emit camera posterize to clients
    const io = socketInstance.getIO();
    io.emit('cameraPosterize', posterizeData);
  });
  
  // Camera sepia received
  rustplusInstance.on('cameraSepia', (sepiaData) => {
    console.log('Camera sepia received:', sepiaData);
    
    // Emit camera sepia to clients
    const io = socketInstance.getIO();
    io.emit('cameraSepia', sepiaData);
  });
  
  // Camera sketch received
  rustplusInstance.on('cameraSketch', (sketchData) => {
    console.log('Camera sketch received:', sketchData);
    
    // Emit camera sketch to clients
    const io = socketInstance.getIO();
    io.emit('cameraSketch', sketchData);
  });
  
  // Camera stamp received
  rustplusInstance.on('cameraStamp', (stampData) => {
    console.log('Camera stamp received:', stampData);
    
    // Emit camera stamp to clients
    const io = socketInstance.getIO();
    io.emit('cameraStamp', stampData);
  });
  
  // Camera tile received
  rustplusInstance.on('cameraTile', (tileData) => {
    console.log('Camera tile received:', tileData);
    
    // Emit camera tile to clients
    const io = socketInstance.getIO();
    io.emit('cameraTile', tileData);
  });
  
  // Camera twirl received
  rustplusInstance.on('cameraTwirl', (twirlData) => {
    console.log('Camera twirl received:', twirlData);
    
    // Emit camera twirl to clients
    const io = socketInstance.getIO();
    io.emit('cameraTwirl', twirlData);
  });
  
  // Camera water received
  rustplusInstance.on('cameraWater', (waterData) => {
    console.log('Camera water received:', waterData);
    
    // Emit camera water to clients
    const io = socketInstance.getIO();
    io.emit('cameraWater', waterData);
  });
  
  // Camera wood received
  rustplusInstance.on('cameraWood', (woodData) => {
    console.log('Camera wood received:', woodData);
    
    // Emit camera wood to clients
    const io = socketInstance.getIO();
    io.emit('cameraWood', woodData);
  });
  
  // Camera xray received
  rustplusInstance.on('cameraXray', (xrayData) => {
    console.log('Camera xray received:', xrayData);
    
    // Emit camera xray to clients
    const io = socketInstance.getIO();
    io.emit('cameraXray', xrayData);
  });
  
  // Camera yuv received
  rustplusInstance.on('cameraYuv', (yuvData) => {
    console.log('Camera yuv received:', yuvData);
    
    // Emit camera yuv to clients
    const io = socketInstance.getIO();
    io.emit('cameraYuv', yuvData);
  });
  
  // Camera zscale received
  rustplusInstance.on('cameraZscale', (zscaleData) => {
    console.log('Camera zscale received:', zscaleData);
    
    // Emit camera zscale to clients
    const io = socketInstance.getIO();
    io.emit('cameraZscale', zscaleData);
  });
  
  // Generic message handler removed - now handled in setupEventListeners
}

/**
 * Handle connection established
 */
function onConnected() {
  console.log('Connected to Rust+ server');
  
  connectionStatus.connected = true;
  connectionStatus.lastConnected = new Date();
  connectionStatus.lastError = null;
  
  // Start checking subscription status
  startSubscriptionCheck();
  
  // Emit connection status to clients
  const io = socketInstance.getIO();
  io.emit('rustplusStatus', getStatus());
  
  // Try to fetch initial map markers after a short delay
  setTimeout(() => {
    if (rustplusInstance && connectionStatus.connected) {
      rustplusInstance.getMapMarkers((message) => {
        if (message && message.response && message.response.mapMarkers) {
          connectionStatus.mapMarkers = message.response.mapMarkers;
          
          // Emit map markers to clients
          const io = socketInstance.getIO();
          io.emit('mapMarkers', message.response.mapMarkers);
        }
      });
    }
  }, 2000); // Wait 2 seconds after connection
}

/**
 * Start checking subscription status
 */
function startSubscriptionCheck() {
  if (checkSubscriptionInterval) {
    clearInterval(checkSubscriptionInterval);
  }
  
  checkSubscriptionInterval = setInterval(async () => {
    try {
      await checkSubscription();
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }, CHECK_INTERVAL);
}

/**
 * Check subscription status
 */
async function checkSubscription() {
  if (!rustplusInstance || !connectionStatus.connected) {
    return;
  }
  
  try {
    // Check if the method exists before calling it
    if (typeof rustplusInstance.getSubscription === 'function') {
      // Use callback-based approach as per Rust+ API
      rustplusInstance.getSubscription((message) => {
        if (message && message.response) {
          // Emit subscription status to clients
          const io = socketInstance.getIO();
          io.emit('subscriptionStatus', message.response);
        }
      });
    }
  } catch (error) {
    console.error('Error checking subscription:', error);
  }
}

/**
 * Get connection status
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
 * Get server time
 */
function getTime() {
  if (!rustplusInstance || !connectionStatus.connected) {
    throw new Error('Not connected to Rust+ server');
  }
  
  return new Promise((resolve, reject) => {
    rustplusInstance.getTime((message) => {
      if (message && message.response) {
        resolve(message.response);
      } else {
        reject(new Error('Invalid time response from server'));
      }
    });
  });
}

/**
 * Get server map
 */
function getMap() {
  if (!rustplusInstance || !connectionStatus.connected) {
    throw new Error('Not connected to Rust+ server');
  }
  
  return new Promise((resolve, reject) => {
    rustplusInstance.getMap((message) => {
      if (message && message.response) {
        resolve(message.response);
    } else {
        reject(new Error('Invalid map response from server'));
      }
    });
  });
}

/**
 * Send team message
 */
function sendTeamMessage(message) {
  if (!rustplusInstance || !connectionStatus.connected) {
    throw new Error('Not connected to Rust+ server');
  }
  
  return new Promise((resolve, reject) => {
    rustplusInstance.sendTeamMessage(message, (response) => {
      if (response) {
        resolve(response);
      } else {
        reject(new Error('No response from team message'));
      }
    });
  });
}

/**
 * Get map markers
 */
function getMapMarkers() {
  if (!rustplusInstance || !connectionStatus.connected) {
    throw new Error('Not connected to Rust+ server');
  }
  
  return new Promise((resolve, reject) => {
    rustplusInstance.getMapMarkers((message) => {
      if (message && message.response && message.response.mapMarkers) {
        resolve(message.response.mapMarkers);
      } else {
        reject(new Error('Invalid map markers response from server'));
      }
    });
  });
}

/**
 * Calculate undercut prices
 */
function calculateUndercutPrices(allyShops, enemyShops) {
  const undercutItems = [];
  const outOfStockLines = []; // queued notifications for new OOS events
  
  // For each ally shop, check if any of their items are being undercut
  allyShops.forEach(allyShop => {
    allyShop.shopContents.forEach(allyItem => {
      // Detect out-of-stock transition for this ally item
      try {
        const stockKey = makeUndercutKey(allyShop.entid, allyItem.itemId, allyItem.currencyId);
        const currentStock = Number(allyItem.amountInStock || 0);
        const prevStock = lastStockByItemKey.has(stockKey) ? lastStockByItemKey.get(stockKey) : null;
        if (prevStock !== null && prevStock > 0 && currentStock <= 0) {
          const itemEmoji = getEmojiTagByItemId(allyItem.itemId) || `Item ${allyItem.itemId}`;
          const currencyEmoji = getEmojiTagByItemId(allyItem.currencyId) || resolveItemName(allyItem.currencyId);
          const shopLabel = allyShop.shopName || `Shop ${allyShop.entid}`;
          const qty = Number(allyItem.quantity) || 1;
          const price = Number(allyItem.costPerItem) || 0;
          outOfStockLines.push(`${shopLabel} | ${qty}x ${itemEmoji} -> ${price}x ${currencyEmoji}`);
        }
        // Update cache
        lastStockByItemKey.set(stockKey, currentStock);
      } catch {}

      // Find the same item in enemy shops by itemId
      const enemyItems = [];
      
      enemyShops.forEach(enemyShop => {
        const matchingItem = enemyShop.shopContents.find(item => 
          item.itemId === allyItem.itemId && item.currencyId === allyItem.currencyId
        );
        
        if (matchingItem) {
          // Only compare if they use the same currency AND have stock
          if (matchingItem.currencyId === allyItem.currencyId && (matchingItem.amountInStock || 0) >= 1) {
            enemyItems.push({
              shopName: enemyShop.shopName,
              shopId: enemyShop.entid,
              price: matchingItem.costPerItem,
              quantity: matchingItem.quantity || 1,
              currencyId: matchingItem.currencyId,
              stock: matchingItem.amountInStock || 0
            });
          }
        }
      });
      
      // If enemy shops have the same item at a lower price, it's being undercut
      if (enemyItems.length > 0) {
        // Calculate price per unit for comparison
        const allyPricePerUnit = allyItem.costPerItem / (allyItem.quantity || 1);
        // Choose best (lowest) price-per-unit among all qualifying competitors
        const ppuList = enemyItems.map(item => item.price / (item.quantity || 1));
        const lowestEnemyPricePerUnit = Math.min(...ppuList);
        
        if (lowestEnemyPricePerUnit <= allyPricePerUnit) {
          // Get item details from the database (safely)
          let itemDetails = null;
          try {
            // Try to get item by numeric ID first (for Rust+ API compatibility)
            itemDetails = rustAssetManager.getItemByNumericId(allyItem.itemId);
            
            // If not found by numeric ID, try by shortname
            if (!itemDetails) {
              itemDetails = rustAssetManager.getItemById(allyItem.itemId);
          }
        } catch (error) {
            // Continue without item details
          }
          
          const undercutItem = {
            allyShop: {
              shopName: allyShop.shopName,
              shopId: allyShop.entid,
              price: allyItem.costPerItem,
              quantity: allyItem.quantity || 1,
              currencyId: allyItem.currencyId,
              stock: allyItem.amountInStock || 0,
              pricePerUnit: allyPricePerUnit,
              currencyImage: `/api/items/${allyItem.currencyId}/image`
            },
            enemyShops: enemyItems
              .map(item => ({
                ...item,
                pricePerUnit: item.price / (item.quantity || 1),
                currencyImage: `/api/items/${item.currencyId}/image`
              }))
              .filter(item => item.pricePerUnit <= allyPricePerUnit)
              .sort((a, b) => a.pricePerUnit - b.pricePerUnit),
            
            itemId: allyItem.itemId,
            itemName: itemDetails ? itemDetails.name : `Item ${allyItem.itemId}`,
            itemImage: itemDetails ? `/api/items/${allyItem.itemId}/image` : null,
            undercutAmount: allyPricePerUnit - lowestEnemyPricePerUnit,
            undercutPercentage: Math.round(((allyPricePerUnit - lowestEnemyPricePerUnit) / allyPricePerUnit) * 100)
          };
          
          undercutItems.push(undercutItem);
        }
      }
    });
  });
  
  // Send notifications for new undercuts
  try {
    if (undercutItems.length > 0 && rustplusInstance && connectionStatus.connected) {
      const newlySeen = [];
      undercutItems.forEach(u => {
        const key = makeUndercutKey(u.allyShop.shopId, u.itemId, u.allyShop.currencyId);
        if (!announcedUndercutKeys.has(key)) {
          announcedUndercutKeys.add(key);
          newlySeen.push(u);
        }
      });
      if (newlySeen.length > 0) {
        const lines = buildUndercutDetectedLines(newlySeen);
        sendTeamMessagesSequential(lines);
      }
    }
  } catch (e) {
    console.warn('Failed to send undercut notifications:', e);
  }

  // Send notifications for newly out-of-stock items
  try {
    if (outOfStockLines.length > 0 && rustplusInstance && connectionStatus.connected) {
      sendTeamMessagesSequential(['Out of stock:', ...outOfStockLines.slice(0, 50)]);
    }
  } catch {}

  // Store last undercut list for summary replies
  lastUndercutItems = undercutItems;

  return undercutItems;
}

/**
 * Get cached map markers
 */
function getCachedMapMarkers() {
  if (!rustplusInstance) {
    return null;
  }
  
  if (!connectionStatus.connected) {
    return null;
  }
  
  if (!connectionStatus.mapMarkers) {
    return null;
  }
  
  return connectionStatus.mapMarkers;
}

/**
 * Manually refresh map markers
 */
async function refreshMapMarkers() {
  if (!rustplusInstance || !connectionStatus.connected) {
    throw new Error('Not connected to Rust+ server');
  }
  
  try {
    const markers = await getMapMarkers();
    if (markers && markers.markers) {
      connectionStatus.mapMarkers = markers;
      
      // Emit updated markers to clients
      const io = socketInstance.getIO();
      io.emit('mapMarkers', markers);
      
      return markers;
    } else {
      throw new Error('Invalid map markers response from server');
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Check if the Rust+ service is ready to handle requests
 */
function isReady() {
    return {
    initialized: !!rustplusInstance,
    connected: connectionStatus.connected,
    hasMapMarkers: !!connectionStatus.mapMarkers,
    lastError: connectionStatus.lastError
  };
}

/**
 * Transform vending machines data
 */
function transformVendingMachines(vendingMachines) {
  return vendingMachines.map(machine => ({
    entid: machine.id || machine.entid, // Use id if available, fallback to entid
    x: machine.x,
    y: machine.y,
    shopName: machine.name || '', // Include the shop name
    shopContents: machine.sellOrders || [] // Use sellOrders if available
  }));
}

module.exports = {
  initializeRustPlus,
  getStatus,
  getTime,
  getMap,
  sendTeamMessage,
  checkSubscription,
  getMapMarkers,
  calculateUndercutPrices,
  getCachedMapMarkers,
  transformVendingMachines,
  refreshMapMarkers,
  isReady,
  setUndercutNotificationDelay,
  getUndercutNotificationDelaySec
}; 

// ===== Helpers for team messages =====

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendTeamMessagesSequential(lines) {
  (async () => {
    for (const line of lines) {
      try {
        rustplusInstance.sendTeamMessage(line, () => {});
      } catch {}
      await sleep(undercutNotificationDelayMs);
    }
  })();
}

function buildUndercutDetectedLines(items) {
  const header = `Undercut detected`;
  const lines = [header];
  const maxLines = 20; // safety cap
  const take = Math.min(items.length, maxLines);
  for (let i = 0; i < take; i++) {
    const u = items[i];
    const itemEmoji = getEmojiTagByItemId(u.itemId) || (u.itemName || `Item ${u.itemId}`);
    const best = Array.isArray(u.enemyShops) && u.enemyShops.length > 0
      ? u.enemyShops[0]
      : null;
    // Prefer competitor details; fallback to ally if none
    const qty = best ? (best.quantity || 1) : (u.allyShop.quantity || 1);
    const price = best ? (best.price || 0) : (u.allyShop.price || 0);
    const currencyId = best ? best.currencyId : u.allyShop.currencyId;
    const shopId = best ? best.shopId : u.allyShop.shopId;
    const currencyEmoji = getEmojiTagByItemId(currencyId) || resolveItemName(currencyId);
    const grid = getGridLabelForShop(shopId) || '??';
    const ratio = qty > 0 ? (price / qty).toFixed(2) : 'N/A';
    lines.push(`@${grid} | ${qty}x ${itemEmoji} -> ${price}x ${currencyEmoji} | 1:${ratio}`);
  }
  if (items.length > maxLines) lines.push(`...and ${items.length - maxLines} more`);
  return lines;
}

function buildUndercutSummaryForTeamLines() {
  if (!lastUndercutItems || lastUndercutItems.length === 0) return [];
  const header = `Current undercuts: ${lastUndercutItems.length}`;
  const lines = [header];
  const maxLines = 50; // safety cap
  const take = Math.min(lastUndercutItems.length, maxLines);
  for (let i = 0; i < take; i++) {
    const u = lastUndercutItems[i];
    const itemEmoji = getEmojiTagByItemId(u.itemId) || (u.itemName || `Item ${u.itemId}`);
    const best = Array.isArray(u.enemyShops) && u.enemyShops.length > 0
      ? u.enemyShops[0]
      : null;
    const qty = best ? (best.quantity || 1) : (u.allyShop.quantity || 1);
    const price = best ? (best.price || 0) : (u.allyShop.price || 0);
    const currencyId = best ? best.currencyId : u.allyShop.currencyId;
    const shopId = best ? best.shopId : u.allyShop.shopId;
    const currencyEmoji = getEmojiTagByItemId(currencyId) || resolveItemName(currencyId);
    const grid = getGridLabelForShop(shopId) || '??';
    const ratio = qty > 0 ? (price / qty).toFixed(2) : 'N/A';
    lines.push(`@${grid} | ${qty}x ${itemEmoji} -> ${price}x ${currencyEmoji} | 1:${ratio}`);
  }
  if (lastUndercutItems.length > maxLines) lines.push(`...and ${lastUndercutItems.length - maxLines} more`);
  return lines;
}

// Compute recommended total price to list at, ensuring at least 1 less per unit
function computeRecommendedPrice(undercut) {
  try {
    const qty = undercut?.allyShop?.quantity || 1;
    if (!qty || qty <= 0) return null;
    const enemies = undercut?.enemyShops || [];
    if (!enemies.length) return null;
    let bestPPU = Infinity;
    for (const e of enemies) {
      const q = e.quantity || 1;
      const ppu = q > 0 ? (e.price / q) : Infinity;
      if (!isFinite(ppu)) continue;
      if (ppu < bestPPU) bestPPU = ppu;
    }
    if (!isFinite(bestPPU) || bestPPU === Infinity) return null;
    const recommendedPPU = Math.max(0, Math.floor(bestPPU - 1));
    const total = Math.max(1, recommendedPPU * qty);
    return total;
  } catch {
    return null;
  }
}

// ===== Emoji helpers =====
function resolveItemName(id) {
  try {
    const info = rustAssetManager.getItemById(id) || rustAssetManager.getItemByNumericId(id);
    return info?.name || `Item ${id}`;
  } catch {
    return `Item ${id}`;
  }
}

function getEmojiTagByItemId(id) {
  try {
    const info = rustAssetManager.getItemById(id) || rustAssetManager.getItemByNumericId(id);
    if (!info || !info.shortname) return null;
    // Rust in-game chat supports item emojis via :shortname:
    // e.g., :rifle.semiauto:, :crude.oil:
    return `:${info.shortname}:`;
  } catch {
    return null;
  }
}

// Build out-of-stock summary (ally shops with amountInStock <= 0)
function buildOutOfStockSummaryLines() {
  try {
    const markers = connectionStatus.mapMarkers?.markers || [];
    const vms = markers.filter(m => m && (m.type === 3 || m.type === 'VendingMachine'));
    const lines = ['Out of stock:'];
    let count = 0;
    const maxLines = 50;
    for (const vm of vms) {
      const shopLabel = vm.name || vm.shopName || `Shop ${vm.id}`;
      const sells = vm.sellOrders || vm.sell_orders || [];
      for (const so of sells) {
        const stock = Number(so.amountInStock ?? so.amount_in_stock ?? 0);
        if (stock <= 0) {
          const itemEmoji = getEmojiTagByItemId(so.itemId ?? so.item_id) || resolveItemName(so.itemId ?? so.item_id);
          const currencyEmoji = getEmojiTagByItemId(so.currencyId ?? so.currency_id) || resolveItemName(so.currencyId ?? so.currency_id);
          const qty = Number(so.quantity) || 1;
          const price = Number(so.costPerItem ?? so.cost_per_item) || 0;
          lines.push(`${shopLabel} | ${qty}x ${itemEmoji} -> ${price}x ${currencyEmoji}`);
          count++;
          if (count >= maxLines) break;
        }
      }
      if (count >= maxLines) break;
    }
    if (count === 0) return [];
    return lines;
  } catch {
    return [];
  }
}

// Convert Rust map coordinates to grid label using 150m cells and estimated world size
function getGridLabelForShop(shopId) {
  try {
    if (!connectionStatus.mapMarkers || !connectionStatus.mapMarkers.markers) return null;
    const markers = connectionStatus.mapMarkers.markers;
    const vm = markers.find(m => (m.type === 3 || m.type === 'VendingMachine') && m.id === shopId);
    if (!vm) return null;
    const worldSize = estimateWorldSize(markers);
    const gridDiameter = 150;
    const first = convertNumberToLetter(Math.floor(vm.x / gridDiameter));
    const second = Math.floor((worldSize - vm.y) / gridDiameter);
    return `${first}${second}`;
  } catch {
    return null;
  }
}

function estimateWorldSize(markers) {
  let maxCoord = 0;
  for (const m of markers) {
    if (typeof m.x === 'number') maxCoord = Math.max(maxCoord, m.x);
    if (typeof m.y === 'number') maxCoord = Math.max(maxCoord, m.y);
  }
  const rounded = Math.ceil(maxCoord / 150) * 150;
  return Math.max(3000, rounded);
}

function convertNumberToLetter(num) {
  const mod = num % 26;
  let pow = (num / 26) | 0;
  const out = mod ? String.fromCharCode(65 + mod) : (pow--, 'Z');
  return pow ? 'A' + out : out;
}