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

// Timestamp for filtering messages
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
        
        console.log('Initializing FCM for pairing...');
        const { fcmCredentials } = await initializePairing();
        
        // Store for later reuse
        currentFcmCredentials = fcmCredentials;

        // Get Expo Push Token
        console.log('Getting Expo Push Token...');
        const expoPushToken = await getExpoPushToken(fcmCredentials.fcm.token);
        
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
        console.log('Waiting for pairing notification from Rust game...');
        const serverInfo = await listenForPairingNotification(fcmCredentials, pairingRequestTimestamp);
        console.log('Pairing completed successfully');
        
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

        return { fcmCredentials };
    } catch (error) {
        console.error('FCM registration error:', error);
        throw error;
    }
}

async function listenForPairingNotification(fcmCredentials, requestTimestamp) {
    // Store the timestamp we'll use to filter messages
    const validSince = requestTimestamp || Date.now();
    
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
                    client.heartbeat();
                }
            }, 30000); // Every 30 seconds
        }

        client.on('ON_DATA_RECEIVED', (data) => {
            // Check if this is a fresh message using the sent timestamp
            const messageSentTimestamp = parseInt(data.sent || '0', 10);
            if (messageSentTimestamp > 0 && messageSentTimestamp < validSince) {
                return; // Skip this message, it's from before our current pairing request
            }
            
            // Look for the server info in the appData array
            const bodyData = data.appData?.find(item => item.key === 'body')?.value;
            
            if (bodyData) {
                try {
                    const serverInfo = JSON.parse(bodyData);
                    
                    if (serverInfo.playerToken) {
                        console.log('Server pairing received');
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
                        
                        resolve(cleanServerInfo);
                    }
                } catch (error) {
                    console.error('Error parsing server info:', error);
                }
            }
        });

        client.on('connect', () => {
            startHeartbeat();
            console.log('FCM client connected, ready for pairing');
            
            pairingStatus = {
                ready: true,
                message: 'Ready for pairing! Please click "Pair with Server" in your Rust game.'
            };
        });

        client.on('disconnect', () => {
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
            .catch(error => {
                console.error('FCM connection error:', error);
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

async function restartPairingListener() {
    if (!currentFcmCredentials) {
        throw new Error('No FCM credentials available, please start the pairing process again');
    }
    
    // Generate a fresh timestamp for this restart
    pairingRequestTimestamp = Date.now();
    console.log('Restarting FCM listener for new pairing request');
    
    // Reset status to ready
    pairingStatus = {
        ready: true,
        message: 'Ready for pairing! Please click "Pair with Server" in your Rust game.'
    };
    
    // Create a new promise to handle the pairing
    const pairingPromise = new Promise((resolve, reject) => {
        // Start listening for pairing notification with our timestamp filter
        listenForPairingNotification(currentFcmCredentials, pairingRequestTimestamp)
            .then(serverInfo => {
                console.log('Pairing completed after restart');
                
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
                console.error('Pairing error after restart:', error);
                
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