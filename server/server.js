const express = require('express');
const { Server } = require("socket.io");
const cors = require('cors');
const pairingService = require('./services/pairingService');

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
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? false 
            : "http://localhost:3000",
        methods: ["GET", "POST"]
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
        console.log('Received pairing request...');
        const { authToken } = req.body;
        console.log('Auth token received:', authToken.substring(0, 10) + '...');

        const result = await pairingService.registerWithRustPlus(authToken);
        console.log('Full registration process completed:', result);

        res.json({ 
            success: true, 
            message: 'Successfully paired with Rust+',
            data: result
        });
    } catch (error) {
        console.error('Registration failed:', error.message);
        res.status(500).json({ success: false, message: error.message });
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

// Start server
server.listen(3001, () => {
    console.log('Server running on port 3001');
    console.log('Ready to receive pairing requests...');
});
