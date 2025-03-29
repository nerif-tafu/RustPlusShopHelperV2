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
        console.log('Initializing FCM...');
        const { fcmCredentials } = await initializePairing();

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
        
        // Start listening for pairing notification
        console.log('Starting to listen for pairing notification...');
        const pairingNotification = await listenForPairingNotification(fcmCredentials);
        
        return {
            registrationToken: response.data.token,
            pairingData: pairingNotification,
            expoPushToken: expoPushToken
        };
    } catch (error) {
        console.error('Registration failed:', error.response?.data || error.message);
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

async function listenForPairingNotification(fcmCredentials) {
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
            console.log('Message data:', data.message?.data);
            console.log('Raw notification:', data.message?.data?.notification);
            
            if (data.message?.data?.notification) {
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
                console.log('Received data but no notification found. Full data:', data);
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

module.exports = {
    initializePairing,
    registerWithRustPlus,
    listenForPairingNotification
}; 