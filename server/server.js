const express = require('express');
const { Server } = require("socket.io");
const cors = require('cors');
const pairingService = require('./services/pairingService');
const rustplusService = require('./services/rustplusService');
const socketInstance = require('./socketInstance');

// Create Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? false
    : "http://localhost:3000"
}));

app.use(express.json());

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
            : "http://localhost:3000",
        methods: ["GET", "POST"]
    }
}));

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

// Callback endpoint for Steam auth
app.get('/callback', async (req, res) => {
    try {
        console.log('Callback received with params:', req.query);
        const authToken = req.query.token;
        const steamId = req.query.steamId;
        
        if (!authToken) {
            console.error('Token missing from callback');
            res.status(400).send('Token missing from request!');
            return;
        }

        res.send(`
            <html>
                <body>
                    <script>
                        console.log('Sending auth data to opener');
                        window.opener.postMessage({
                            type: 'RUST_PLUS_AUTH',
                            token: '${authToken}',
                            steamId: '${steamId || ''}'
                        }, window.location.origin);
                        window.close();
                    </script>
                    Steam Account successfully linked with Rust+. You can close this window.
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Failed to process callback');
    }
});

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

// Start server
server.listen(3001, () => {
    console.log('Server running on port 3001');
    console.log('Ready to receive pairing requests...');
    
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
});
