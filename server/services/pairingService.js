const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const AndroidFCM = require('@liamcottle/push-receiver/src/android/fcm');
const PushReceiverClient = require("@liamcottle/push-receiver/src/client");
const crypto = require('crypto');

const FCM_CONFIG = {
    apiKey: "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY",
    projectId: "rust-companion-app",
    gcmSenderId: "976529667804",
    gmsAppId: "1:976529667804:android:d6f1ddeb4403b338fea619",
    androidPackageName: "com.facepunch.rust.companion",
    androidPackageCert: "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD"
};

let pairingStatus = {
    ready: false,
    message: 'Initializing FCM connection...'
};

// Store the current FCM credentials globally for reuse
let currentFcmCredentials = null;

// Add at the top of the file
let pairingRequestTimestamp = Date.now();

function getPairingStatus() {
    return pairingStatus;
}

// Generate a random FCM token
function generateFCMToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function getExpoPushToken(fcmToken) {
    const response = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
        type: 'fcm',
        deviceId: uuidv4(),
        development: false,
        appId: 'com.facepunch.rust.companion',
        deviceToken: fcmToken,
        projectId: "49451aca-a822-41e6-ad59-955718d0ff9c",
    });
    return response.data.data.expoPushToken;
}

async function registerWithRustPlus(authToken) {
    try {
        // Generate a new timestamp for this pairing session
        pairingRequestTimestamp = Date.now();
        
        console.log('Initializing FCM with timestamp:', pairingRequestTimestamp);
        const { fcmCredentials } = await initializePairing();
        
        // Store for later reuse
        currentFcmCredentials = fcmCredentials;

        // Get Expo Push Token
        console.log('Getting Expo Push Token...');
        const expoPushToken = await getExpoPushToken(fcmCredentials.fcm.token);
        console.log('Got Expo Push Token:', expoPushToken);

        // Register with Rust+ using Expo token
        console.log('Registering with Rust+...');
        const registerData = {
            AuthToken: authToken,
            DeviceId: 'rustplus.js',
            PushKind: 3,
            PushToken: expoPushToken
        };

        const response = await axios.post('https://companion-rust.facepunch.com/api/push/register', registerData, {
            allowAbsoluteUrls: true,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('Registration successful');
        
        // Start listening for pairing notification with timestamp filter
        console.log('Starting to listen for pairing notification...');
        const serverInfo = await listenForPairingNotification(fcmCredentials, pairingRequestTimestamp);
        console.log('Pairing notification received:', serverInfo);
        
        return {
            pairingData: serverInfo,
            fcmCredentials
        };
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

async function initializePairing() {
    console.log('Starting FCM registration...');
    try {
        // Register with FCM
        const fcmCredentials = await AndroidFCM.register(
            FCM_CONFIG.apiKey,
            FCM_CONFIG.projectId,
            FCM_CONFIG.gcmSenderId,
            FCM_CONFIG.gmsAppId,
            FCM_CONFIG.androidPackageName,
            FCM_CONFIG.androidPackageCert
        );
        console.log('Full FCM credentials:', {
            androidId: fcmCredentials.gcm.androidId,
            securityToken: fcmCredentials.gcm.securityToken,
            appId: fcmCredentials.gcm.appId,
            fcmToken: fcmCredentials.fcm.token
        });

        // Skip Expo token for now
        return {
            fcmCredentials
        };
    } catch (error) {
        console.error('Detailed FCM error:', error);
        if (error.response) {
            console.error('FCM response data:', error.response.data);
            console.error('FCM response status:', error.response.status);
        }
        throw error;
    }
}

async function listenForPairingNotification(fcmCredentials, requestTimestamp) {
    // Store the timestamp we'll use to filter messages
    const validSince = requestTimestamp || Date.now();
    console.log(`Starting FCM listener with timestamp filter: ${validSince}`);
    
    pairingStatus = {
        ready: false,
        message: 'Initializing FCM connection...'
    };
    
    return new Promise((resolve, reject) => {
        console.log('Starting FCM listener...');
        let isResolved = false;
        let heartbeatInterval;
        
        const client = new PushReceiverClient(
            fcmCredentials.gcm.androidId,
            fcmCredentials.gcm.securityToken,
            [],
            {
                persistentIds: [],
                lastStreamId: 0,
                networkManager: {
                    keepConnection: true,
                    retryCount: 10,
                    retryDelay: 1000
                }
            }
        );

        // Add heartbeat
        function startHeartbeat() {
            heartbeatInterval = setInterval(() => {
                if (client.connected) {
                    console.log('Sending heartbeat...');
                    client.heartbeat();
                }
            }, 30000); // Every 30 seconds
        }

        client.on('ON_DATA_RECEIVED', (data) => {
            console.log('Received FCM data:', JSON.stringify(data, null, 2));
            
            // Check if this is a fresh message using the sent timestamp
            const messageSentTimestamp = parseInt(data.sent || '0', 10);
            if (messageSentTimestamp > 0 && messageSentTimestamp < validSince) {
                console.log(`Ignoring stale FCM message (sent: ${messageSentTimestamp}, filter: ${validSince})`);
                return; // Skip this message, it's from before our current pairing request
            }
            
            // Look for the server info in the appData array
            const bodyData = data.appData?.find(item => item.key === 'body')?.value;
            
            if (bodyData) {
                try {
                    const serverInfo = JSON.parse(bodyData);
                    console.log('Parsed server info:', serverInfo);
                    
                    if (serverInfo.playerToken) {
                        console.log('Player token received:', serverInfo.playerToken);
                        isResolved = true;
                        client.destroy();
                        
                        // Create a clean server info object
                        const cleanServerInfo = {
                            name: serverInfo.name || data.appData?.find(item => item.key === 'gcm.notification.title')?.value || 'Unknown Server',
                            desc: serverInfo.desc || 'No description provided',
                            ip: serverInfo.ip,
                            port: serverInfo.port,
                            playerId: serverInfo.playerId,
                            playerToken: serverInfo.playerToken
                        };
                        
                        console.log('Returning clean server info:', cleanServerInfo);
                        resolve(cleanServerInfo);
                    } else {
                        console.log('Warning: Server info received but no player token found');
                        console.log('Full server info:', serverInfo);
                    }
                } catch (error) {
                    console.error('Error parsing server info:', error);
                    console.error('Raw body data:', bodyData);
                }
            } else if (data.message?.data?.notification) {
                try {
                    const notification = JSON.parse(data.message.data.notification);
                    console.log('Parsed notification data:', notification);
                    
                    if (notification.playerToken) {
                        console.log('Player token received:', notification.playerToken);
                        isResolved = true;
                        client.destroy();
                        resolve(notification);
                    } else {
                        console.log('Warning: Notification received but no player token found');
                        console.log('Full notification object:', notification);
                    }
                } catch (error) {
                    console.error('Error parsing notification:', error);
                    console.error('Raw notification string:', data.message.data.notification);
                }
            } else {
                console.log('Received data but no server info found. Searching appData...');
                console.log('Full data:', data);
            }
        });

        client.on('connect', () => {
            console.log('FCM client connected, starting heartbeat...');
            startHeartbeat();
            console.log('FCM Client Details:', {
                androidId: fcmCredentials.gcm.androidId,
                persistentIds: [],
                lastStreamId: client.lastStreamId,
                connected: client.connected
            });
            console.log('Please click "Pair with Server" in the Rust game now');
            
            pairingStatus = {
                ready: true,
                message: 'Ready for pairing! Please click "Pair with Server" in your Rust game.'
            };
        });

        // Add more event listeners
        client.on('message', (message) => {
            console.log('Raw FCM message received:', message);
        });

        client.on('notification', (notification) => {
            console.log('FCM notification received:', notification);
        });

        client.on('messageStanza', (stanza) => {
            console.log('FCM message stanza received:', stanza);
        });

        client.on('disconnect', () => {
            console.log('FCM client disconnected, clearing heartbeat...');
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            if (!isResolved) {
                reject(new Error('FCM client disconnected before receiving notification'));
            }
        });

        client.on('error', (error) => {
            console.error('FCM client error:', error);
            if (!isResolved) {
                reject(error);
            }
        });

        // Connect to FCM
        client.connect()
            .then(() => {
                console.log('FCM client connected successfully');
            })
            .catch(error => {
                console.error('Detailed connection error:', error);
                console.error('Connection stack:', error.stack);
                reject(error);
            });

        // Update timeout cleanup
        setTimeout(() => {
            if (!isResolved) {
                console.log('FCM listener timed out - no notification received');
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                }
                client.destroy();
                reject(new Error('Pairing timeout - please try again'));
            }
        }, 10 * 60 * 1000);
    });
}

// Update the restartPairingListener function to create a brand new connection
async function restartPairingListener() {
    if (!currentFcmCredentials) {
        throw new Error('No FCM credentials available, please start the pairing process again');
    }
    
    // Generate a fresh timestamp for this restart
    pairingRequestTimestamp = Date.now();
    console.log(`Restarting FCM listener with timestamp filter: ${pairingRequestTimestamp}`);
    
    // Reset status to ready
    pairingStatus = {
        ready: true,
        message: 'Ready for pairing! Please click "Pair with Server" in your Rust game.'
    };
    
    console.log('Restarting FCM listener with stored credentials...');
    
    // Create a new promise to handle the pairing
    const pairingPromise = new Promise((resolve, reject) => {
        // Start listening for pairing notification with our timestamp filter
        listenForPairingNotification(currentFcmCredentials, pairingRequestTimestamp)
            .then(serverInfo => {
                console.log('Restart pairing completed with server info:', serverInfo);
                
                // Get the Socket.IO instance and emit the event
                const socketInstance = require('../socketInstance');
                const io = socketInstance.getIO();
                
                if (io) {
                    io.emit('pairingComplete', {
                        success: true,
                        data: {
                            pairingData: serverInfo,
                            fcmCredentials: currentFcmCredentials
                        }
                    });
                    
                    resolve({
                        success: true,
                        data: serverInfo
                    });
                } else {
                    const error = new Error('Socket.IO instance not found');
                    console.error(error);
                    reject(error);
                }
            })
            .catch(error => {
                console.error('Background pairing listener error:', error);
                
                // Get the Socket.IO instance and emit an error
                const socketInstance = require('../socketInstance');
                const io = socketInstance.getIO();
                
                if (io) {
                    io.emit('pairingError', {
                        success: false,
                        error: error.message
                    });
                }
                
                reject(error);
            });
    });
    
    // Return success immediately - the actual pairing will happen in the background
    return { success: true };
}

module.exports = {
    initializePairing,
    registerWithRustPlus,
    listenForPairingNotification,
    getPairingStatus,
    restartPairingListener
}; 