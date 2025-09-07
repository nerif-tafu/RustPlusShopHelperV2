const express = require('express');
const { Server } = require("socket.io");
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pairingService = require('./services/pairingService');
const rustplusService = require('./services/rustplusService');
const rustAssetManager = require('./services/RustAssetManager');
const socketInstance = require('./socketInstance');
const cron = require('node-cron');

// Create Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? false
    : ["http://localhost:3000", "http://localhost:5173"]
}));

app.use(express.json());

// Serve static files from the dist directory (built frontend)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Add CORS headers
app.use((req, res, next) => {
    res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: err.message });
});

// Create HTTP server
const server = require('http').createServer(app);

// Initialize Socket.IO
const io = socketInstance.initialize(new Server(server, {
  cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? false 
            : ["http://localhost:3000", "http://localhost:5173"],
        methods: ["GET", "POST"]
    }
}));

// Make the io object available to other modules
global.io = io;

// Set up socket handlers
io.on('connection', (socket) => {
  console.log('Client connected to socket.io');
  
  // Handle status request
  socket.on('getStatus', () => {
    const status = rustplusService.getStatus();
    console.log('Client requested Rust+ status, sending:', status.connected ? 'connected' : 'disconnected');
    socket.emit('rustplusStatus', status);
  });
  
  // More socket handlers...
});

// Initialize the item database and serve item images
(async () => {
  try {
    console.log('Initializing item database...');
    await rustAssetManager.loadDatabase();
    console.log('Item database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize item database:', error);
  }
})();

// Serve item images
rustAssetManager.serveItemImages(app);

// Item database endpoints
app.get('/api/items', async (req, res) => {
  try {
    const stats = await rustAssetManager.getDatabaseStats();
    
    // If the client requests all items, return the full database
    if (req.query.all === 'true') {
      // Get all items from the database
      const items = rustAssetManager.getAllItems();
      res.json({ 
        success: true, 
        data: {
          ...stats,
          items
        }
      });
      return;
    }
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting database stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to check database status
app.get('/api/items/debug', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const databasePath = path.join(__dirname, 'data', 'itemDatabase.json');
    const imagesPath = path.join(__dirname, 'data', 'images');
    
    const databaseExists = fs.existsSync(databasePath);
    const imagesExist = fs.existsSync(imagesPath);
    
    let databaseSize = 0;
    let imageCount = 0;
    
    if (databaseExists) {
      const stats = fs.statSync(databasePath);
      databaseSize = stats.size;
      
      try {
        const data = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
        const itemCount = Object.keys(data.items || {}).length;
        res.json({
          success: true,
          database: {
            exists: true,
            size: databaseSize,
            itemCount: itemCount,
            lastModified: stats.mtime
          },
          images: {
            exists: imagesExist,
            count: imagesExist ? fs.readdirSync(imagesPath).filter(f => f.endsWith('.png')).length : 0
          },
          cache: {
            loaded: itemDatabaseCache !== null,
            cacheSize: itemDatabaseCache ? Object.keys(itemDatabaseCache).length : 0
          }
        });
      } catch (parseError) {
        res.json({
          success: false,
          error: 'Database file exists but is corrupted',
          database: {
            exists: true,
            size: databaseSize,
            lastModified: stats.mtime
          },
          parseError: parseError.message
        });
      }
    } else {
      res.json({
        success: false,
        error: 'Database file does not exist',
        database: {
          exists: false
        },
        images: {
          exists: imagesExist
        }
      });
    }
  } catch (error) {
    console.error('Error checking database status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/items/:id', (req, res) => {
  try {
    const item = rustAssetManager.getItemById(req.params.id);
    if (item) {
      res.json({ success: true, data: item });
    } else {
      res.status(404).json({ success: false, error: 'Item not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/items/:id/image', (req, res) => {
  try {
    const itemId = req.params.id;
    
    // Try to get item by numeric ID first (for Rust+ API compatibility)
    let item = rustAssetManager.getItemByNumericId(itemId);
    
    // If not found by numeric ID, try by shortname
    if (!item) {
      item = rustAssetManager.getItemById(itemId);
    }
    
    if (item && item.shortname) {
      // Check if the image file actually exists
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(__dirname, 'data', 'images', `${item.shortname}.png`);
      
      if (fs.existsSync(imagePath)) {
        // Redirect to the static image endpoint
        res.redirect(`/api/items/images/${item.shortname}.png`);
      } else {
        console.log(`Image file not found at: ${imagePath}`);
        // Image file doesn't exist, return a 404
        res.status(404).json({ 
          success: false, 
          error: 'Item image file not found',
          itemId: itemId,
          shortname: item.shortname,
          imagePath: imagePath
        });
      }
    } else {
      console.log(`Item not found in database for ID: ${itemId}`);
      res.status(404).json({ 
        success: false, 
        error: 'Item not found in database',
        itemId: itemId
      });
    }
  } catch (error) {
    console.error('Error serving item image:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      itemId: req.params.id
    });
  }
});

app.post('/api/items/update', async (req, res) => {
  try {
    // Start update in background
    await rustAssetManager.updateItemDatabase(io);
    res.json({ success: true, message: 'Database update started' });
  } catch (error) {
    console.error('Error starting database update:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pairing endpoints
app.post('/api/pairing/initialize', async (req, res) => {
    try {
        const pairingData = await pairingService.initializePairing();
        res.json(pairingData);
    } catch (error) {
        console.error('Initialization failed:', error);
        res.status(500).json({ error: 'Failed to initialize pairing' });
    }
});

app.post('/api/pairing/register', async (req, res) => {
    try {
        const { authToken } = req.body;
        console.log('Received pairing request...');
        
        // Send immediate response that registration has started
        res.json({
            success: true,
            message: 'Registration started, please wait for server readiness',
            status: 'initializing',
            data: {
                readyForPairing: false
            }
        });
        
        // Start the registration process in the background
        try {
            const result = await pairingService.registerWithRustPlus(authToken);
            
            // When pairing data is received, emit via socket.io to all clients
            io.emit('pairingComplete', {
                success: true,
                data: result
            });
            
            console.log('Server pairing completed, data sent to client');
        } catch (error) {
            console.error('Background registration failed:', error);
            io.emit('pairingError', {
                success: false,
                error: error.message
            });
        }
    } catch (error) {
        console.error('Registration failed:', error);
        res.status(500).json({ success: false, error: 'Failed to register' });
    }
});

app.post('/api/pairing/listen', async (req, res) => {
    try {
        const { fcmCredentials } = req.body;
        const notification = await pairingService.listenForPairingNotification(fcmCredentials);
        res.json(notification);
    } catch (error) {
        console.error('Listening failed:', error);
        res.status(500).json({ error: 'Failed to receive pairing notification' });
    }
});

// Steam callback endpoint removed - no longer needed

// New endpoint to confirm pairing and save server details
app.post('/api/pairing/confirm', async (req, res) => {
  try {
    const { serverInfo } = req.body;
    
    if (!serverInfo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Server info is required' 
      });
    }
    
    // Save the server info to RPData.json
    const fs = require('fs');
    const path = require('path');
    const rpDataPath = path.join(__dirname, 'RPData.json');
    
    // Read existing data
    let rpData = {};
    try {
      rpData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
    } catch (error) {
      console.warn('Creating new RPData.json file');
    }
    
    // Update with new server info
    const serverName = serverInfo.name || 
                      serverInfo.appData?.find(item => item.key === 'gcm.notification.title')?.value || 
                      `${serverInfo.ip}:${serverInfo.port}`;

    rpData.serverName = serverName;
    rpData.serverIP = serverInfo.ip;
    rpData.appPort = serverInfo.port;
    rpData.steamID = serverInfo.playerId;
    rpData.playerToken = serverInfo.playerToken;
    
    // Save to file
    fs.writeFileSync(rpDataPath, JSON.stringify(rpData, null, 2), 'utf8');
    console.log('Server details saved successfully');
    
    res.json({ 
      success: true, 
      message: 'Server details saved successfully',
      data: rpData
    });
  } catch (error) {
    console.error('Failed to save server details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add a new endpoint to check if server is ready for pairing
app.get('/api/pairing/status', async (req, res) => {
    try {
        const status = pairingService.getPairingStatus();
        res.json({
            success: true,
            status: status.ready ? 'ready' : 'initializing',
            message: status.message,
            data: {
                readyForPairing: status.ready
            }
        });
    } catch (error) {
        console.error('Failed to get pairing status:', error);
        res.status(500).json({ success: false, error: 'Failed to get status' });
    }
});

// Add a new endpoint to restart the FCM listener
app.post('/api/pairing/restart', async (req, res) => {
    try {
        // Use the same FCM credentials but restart the listener
        const result = await pairingService.restartPairingListener();
        
        res.json({
            success: true,
            message: 'FCM listener restarted, ready for pairing',
            data: {
                readyForPairing: true
            }
        });
    } catch (error) {
        console.error('Failed to restart FCM listener:', error);
        res.status(500).json({ success: false, error: 'Failed to restart listener' });
    }
});

// Get FCM connection status
app.get('/api/fcm/status', async (req, res) => {
    try {
        const status = pairingService.getFCMStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Failed to get FCM status:', error);
        res.status(500).json({ success: false, error: 'Failed to get FCM status' });
    }
});

// Get Expo notification status
app.get('/api/expo/status', async (req, res) => {
    try {
        const status = pairingService.getExpoStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Failed to get Expo status:', error);
        res.status(500).json({ success: false, error: 'Failed to get Expo status' });
    }
});

// Attempt to reconnect using saved authentication
app.post('/api/auth/reconnect', async (req, res) => {
    try {
        const result = await pairingService.attemptReconnection();
        res.json(result);
    } catch (error) {
        console.error('Failed to reconnect:', error);
        res.status(500).json({ success: false, error: 'Failed to reconnect' });
    }
});

// Add this endpoint to get current server data
app.get('/api/pairing/current', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const rpDataPath = path.join(__dirname, 'RPData.json');
    
    // Check if file exists
    if (!fs.existsSync(rpDataPath)) {
      return res.json({
        success: true,
        data: null,
        message: 'No server paired'
      });
    }
    
    // Read the server data
    const serverData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
    
    // Create a safe version without the player token
    const safeServerData = { 
      serverName: serverData.serverName,
      serverIP: serverData.serverIP,
      appPort: serverData.appPort,
      steamID: serverData.steamID
      // playerToken deliberately omitted for security
    };
    
    // Return the server data
    return res.json({
      success: true,
      data: safeServerData,
      message: 'Server data retrieved'
    });
  } catch (error) {
    console.error('Failed to get server data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get server data'
    });
  }
});

// Add this endpoint to disconnect the server
app.post('/api/pairing/disconnect', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const rpDataPath = path.join(__dirname, 'RPData.json');
    
    // Check if file exists
    if (fs.existsSync(rpDataPath)) {
      // Delete the file
      fs.unlinkSync(rpDataPath);
    }
    
    return res.json({
      success: true,
      message: 'Server disconnected'
    });
  } catch (error) {
    console.error('Failed to disconnect server:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to disconnect server'
    });
  }
});

// Add a new endpoint to initialize the RustPlus connection
app.post('/api/rustplus/connect', async (req, res) => {
  try {
    const result = await rustplusService.initializeRustPlus();
    res.json(result);
  } catch (error) {
    console.error('Failed to initialize RustPlus:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add an endpoint to get the RustPlus connection status
app.get('/api/rustplus/status', async (req, res) => {
  try {
    const status = rustplusService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Failed to get RustPlus status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add an endpoint to get the current time from the Rust server
app.get('/api/rustplus/time', async (req, res) => {
  try {
    const time = await rustplusService.getTime();
    res.json({
      success: true,
      data: time
    });
  } catch (error) {
    console.error('Failed to get time from Rust server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add an endpoint to get map markers from the Rust server
app.get('/api/rustplus/mapMarkers', async (req, res) => {
  try {
    const markers = await rustplusService.getMapMarkers();
    res.json({
      success: true,
      data: markers
    });
  } catch (error) {
    console.error('Failed to get map markers from Rust server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add an endpoint to get the map from the Rust server
app.get('/api/rustplus/map', async (req, res) => {
  try {
    console.log('Map request received');
    
    // Check connection status first
    const status = rustplusService.getStatus();
    console.log('Rust+ connection status:', status);
    
    // Check service readiness
    const readiness = rustplusService.isReady();
    console.log('Service readiness:', readiness);
    
    if (!readiness.connected) {
      console.log('Rust+ not connected, returning error');
      return res.status(400).json({
        success: false,
        error: 'Not connected to Rust+ server',
        details: readiness
      });
    }
    
    const mapData = await rustplusService.getMap();
    console.log('Map data received:', mapData);
    
    // Extract the image data and convert to base64
    let processedMapData = null;
    if (mapData && mapData.map && mapData.map.jpgImage) {
      const jpgBuffer = mapData.map.jpgImage;
      const base64Image = jpgBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;
      
      processedMapData = {
        image: dataUrl,
        width: mapData.map.width,
        height: mapData.map.height,
        oceanMargin: mapData.map.oceanMargin,
        background: mapData.map.background,
        monuments: mapData.map.monuments
      };
      
      console.log('Processed map data with image URL');
    } else {
      console.log('No jpgImage found in map data');
      processedMapData = mapData;
    }
    
    res.json({
      success: true,
      data: processedMapData
    });
  } catch (error) {
    console.error('Failed to get map from Rust server:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add this endpoint to your server.js file
app.post('/api/undercutter/calculate', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid item IDs are required'
      });
    }
    
    // Here you would implement your actual undercutting logic
    // This is a placeholder implementation
    const suggestions = await rustplusService.calculateUndercutPrices(itemIds);
    
    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error calculating undercutting prices:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate prices'
    });
  }
});

// Add this new endpoint for vending machine data with pre-processed undercut information
app.get('/api/rustplus/vendingMachines', async (req, res) => {
  try {
    const prefix = req.query.prefix || '';
    console.log('Vending machines request received for prefix:', prefix);
    
    // Check if Rust+ is connected first
    const status = rustplusService.getStatus();
    
    if (!status.connected) {
      return res.status(400).json({
        success: false,
        error: 'Not connected to Rust+ server'
      });
    }
    
    // Check service readiness
    const readiness = rustplusService.isReady();
    
    const vendingMachines = rustplusService.getCachedMapMarkers();
    
    // Check if we have map markers data
    if (!vendingMachines || !vendingMachines.markers) {
      return res.status(404).json({
        success: false,
        error: 'No map markers available. Please wait for the connection to stabilize.',
        details: {
          serviceReady: readiness,
          suggestion: readiness.connected && !readiness.hasMapMarkers 
            ? 'Try refreshing markers or wait a moment for data to load'
            : 'Ensure Rust+ connection is established first'
        }
      });
    }
    
    // Extract the markers array from the returned object
    const markers = vendingMachines.markers;
    
    const allShops = markers.filter(marker => marker.type === 'VendingMachine' || marker.type === 3);
    
    // Transform all shops to the standardized format
    const transformedShops = rustplusService.transformVendingMachines(allShops);
    
    // Categorize the transformed shops
    const allyShops = transformedShops.filter(shop => 
      shop.shopName && shop.shopName.toLowerCase().includes(prefix.toLowerCase())
    );
    
    const enemyShops = transformedShops.filter(shop => 
      shop.shopName && !shop.shopName.toLowerCase().includes(prefix.toLowerCase())
    );
    
    // Pre-calculate undercut items
    const undercutListings = rustplusService.calculateUndercutPrices(allyShops, enemyShops);
    
    // Return the structured data
    res.json({
      success: true,
      data: {
        allyShops,
        enemyShops,
        undercutListings
      }
    });
  } catch (error) {
    // Only log unexpected errors, not the expected "no map markers" case
    if (!error.message.includes('No map markers available')) {
      console.error('Error getting vending machines:', error);
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint to check service readiness
app.get('/api/rustplus/status', (req, res) => {
  try {
    const status = rustplusService.getStatus();
    const readiness = rustplusService.isReady();
    
    res.json({
      success: true,
      data: {
        ...status,
        readiness
      }
    });
  } catch (error) {
    console.error('Error getting service status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint to manually refresh map markers
app.post('/api/rustplus/refresh-markers', async (req, res) => {
  try {
    const markers = await rustplusService.refreshMapMarkers();
    res.json({
      success: true,
      message: 'Map markers refreshed successfully',
      data: markers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add endpoint to manually fetch map markers (for debugging)
app.get('/api/rustplus/fetch-markers', async (req, res) => {
  try {
    const markers = await rustplusService.getMapMarkers();
    res.json({
      success: true,
      message: 'Map markers fetched successfully',
      data: markers
    });
  } catch (error) {
    console.error('Error fetching map markers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// We can keep the individual endpoint too for specific lookups
app.get('/api/rustplus/vendingMachine/:id', async (req, res) => {
  try {
    // Get the vending machine ID from request parameters
    const vendingMachineId = parseInt(req.params.id);
    
    // Get access to your rustplus instance
    const rustplus = rustplusService;
    
    // Check connection status from the service
    const status = rustplusService.getStatus();
    if (!status.connected) {
      return res.status(400).json({ 
        success: false, 
        error: 'Not connected to Rust+' 
      });
    }
    
    // Use cached map markers instead of making a new request each time
    const mapMarkers = rustplusService.getCachedMapMarkers();
    
    if (!mapMarkers || !mapMarkers.markers) {
      return res.status(404).json({ 
        success: false, 
        error: 'No map markers available. Please wait for the connection to stabilize.' 
      });
    }
    
    // Filter for vending machines (type 3) and find the matching ID
    const vendingMachine = mapMarkers.markers
      .filter(marker => marker.type === 3 || marker.type === "VendingMachine")
      .find(vm => vm.id === vendingMachineId);
    
    if (!vendingMachine) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vending machine not found' 
      });
    }
    
    // Return the vending machine data
    return res.json({
      success: true,
      data: {
        id: vendingMachine.id,
        name: vendingMachine.name,
        location: {
          x: vendingMachine.x,
          y: vendingMachine.y
        },
        sellOrders: vendingMachine.sellOrders || []
      }
    });
  } catch (error) {
    console.error('Error fetching vending machine:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Steam login endpoints removed - no longer needed

// Database reset endpoint removed - no longer needed

// Catch-all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Start server
server.listen(3001, () => {
    console.log('Server running on port 3001');
    console.log('Ready to receive pairing requests...');
    
    // Initialize authentication on startup
    pairingService.initializeAuth()
      .then(() => {
        console.log('Authentication initialization completed');
      })
      .catch(error => {
        console.error('Authentication initialization failed:', error);
      });
    
    // Initialize RustPlus connection if server data exists
    rustplusService.initializeRustPlus()
      .then(result => {
        if (result.success) {
          console.log('RustPlus initialization started');
        } else {
          console.log('RustPlus initialization failed:', result.error);
        }
      })
      .catch(error => {
        console.error('RustPlus initialization error:', error);
      });
    
    // Schedule item database update for the first Thursday of each month at 8PM GMT
    console.log('Setting up scheduled database updates for first Thursday of each month at 8PM GMT');
    cron.schedule('0 20 * * 4', () => {
      // Check if this is the first Thursday of the month
      const today = new Date();
      const day = today.getDate();
      
      // If this is the first Thursday of the month (day <= 7)
      if (day <= 7) {
        console.log('Running scheduled item database update (first Thursday of the month)');
        rustAssetManager.updateItemDatabase(io)
          .then(result => console.log('Scheduled database update result:', result))
          .catch(err => console.error('Scheduled database update failed:', err));
      }
    }, {
      timezone: "Etc/GMT" // Run at specified time in GMT
    });
});
