<!-- Settings.vue -->
<template>
  <v-container>
    <div class="settings-container">
      <!-- Description Box -->
      <div class="content-box">
        <h2 class="text-h5 mb-4">Server Connection Settings</h2>
        <p class="text-body-1 mb-4">
          To connect to your Rust server, you'll need to pair this application with your game. 
          Click "Pair with Server" below and follow the steps to complete the pairing process.
        </p>
        <v-btn
          color="primary"
          @click="startPairing"
          class="mt-4 navbar-btn"
        >
          <v-icon left class="pr-2">mdi-link-variant</v-icon>
          Pair with Server
        </v-btn>
      </div>

      <!-- Pairing Dialog -->
      <v-dialog v-model="pairingDialog" max-width="600">
        <v-card class="content-box">
          <v-card-title class="text-h5">Pair with Rust Server</v-card-title>
          <v-card-text>
            <v-stepper 
              v-model="activeStep"
              :items="steps"
              class="stepper-custom"
              :hide-actions="activeStep === '2' || activeStep === '3' || activeStep === '4'"
            >
              <!-- Login Step -->
              <template v-slot:item.1>
                <h3 class="text-h6 mb-4">Login with Steam</h3>
                <ol class="text-body-1">
                  <li>
                    <v-btn
                      color="primary"
                      class="mb-2 navbar-btn"
                      @click="openSteamLogin"
                    >
                      <v-icon left class="pr-2">mdi-steam</v-icon>
                      Open Rust+ Login
                    </v-btn>
                  </li>
                  <li>1. Press the button above to login with your Steam account</li>
                  <li>2. Once you are at the "Welcome" screen, click <strong>Next</strong></li>
                </ol>
              </template>

              <!-- Copy Step -->
              <template v-slot:item.2>
                <h3 class="text-h6 mb-4">Copy the Auth Data</h3>
                
                <div v-if="isPairingInProgress" class="text-center py-4">
                  <v-progress-circular
                    indeterminate
                    color="primary"
                    class="mb-4"
                  ></v-progress-circular>
                  
                  <div class="text-body-1 mb-2">{{ serverReadyMessage }}</div>
                  <div class="text-caption">Please wait while we connect to the Rust+ servers...</div>
                </div>
                
                <div v-else>
                  <ol class="text-body-1">
                    <li>1. On the welcome page, right-click and select "View Page Source"</li>
                    <li>2. Press Ctrl+A to select all the HTML content</li>
                    <li>3. Press Ctrl+C to copy it</li>
                    <li>4. Click the "Paste HTML" button below</li>
                  </ol>
                  <v-btn
                    color="primary"
                    class="mt-4 navbar-btn"
                    @click="promptForHTML"
                  >
                    <v-icon left class="pr-2">mdi-content-paste</v-icon>
                    Paste HTML
                  </v-btn>
                </div>
              </template>

              <!-- Pair Step -->
              <template v-slot:item.3>
                <h3 class="text-h6 mb-4">Complete Pairing with Rust server</h3>
                <ol class="text-body-1">
                  <li>1. Open Rust and connect to the server you want to pair with</li>
                  <li>2. Press <v-code>ESC</v-code> to open the menu and click <v-code>Rust+</v-code></li>
                  <li>3. Click <v-code>Pair with Server</v-code></li>
                </ol>
              </template>

              <!-- Confirmation Step -->
              <template v-slot:item.4>
                <v-card hide-actions class="content-box">
                  <div v-if="serverInfo" class="server-details mb-4">
                    <div class="text-h6 mb-2">{{ serverInfo.name }}</div>
                    <div class="text-body-2 mb-4">{{ serverInfo.desc || "No description provided" }}</div>
                    
                    <v-divider class="mb-4"></v-divider>
                    
                    <div class="d-flex align-center mb-2">
                      <v-icon class="mr-2">mdi-server</v-icon>
                      <div>
                        <div class="text-caption">Server Address</div>
                        <div>{{ serverInfo.ip }}:{{ serverInfo.port }}</div>
                      </div>
                    </div>
                    
                    <div class="d-flex align-center mb-2">
                      <v-icon class="mr-2">mdi-steam</v-icon>
                      <div>
                        <div class="text-caption">Steam ID</div>
                        <div>{{ serverInfo.playerId }}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div class="d-flex justify-space-between mt-4">
                    <v-btn
                      color="error"
                      variant="outlined"
                      class="navbar-btn"
                      @click="restartPairing"
                    >
                      <v-icon left class="pr-2">mdi-arrow-left</v-icon>
                      Go Back
                    </v-btn>
                    
                    <v-btn
                      color="success"
                      class="navbar-btn"
                      @click="confirmPairing"
                    >
                      <v-icon left class="pr-2">mdi-check</v-icon>
                      Confirm and Save
                    </v-btn>
                  </div>
                </v-card>
              </template>
            </v-stepper>
          </v-card-text>
        </v-card>
      </v-dialog>

      <!-- HTML Input Dialog -->
      <v-dialog v-model="showHTMLDialog" max-width="800">
        <v-card class="content-box">
          <v-card-title class="text-h5">Paste HTML Content</v-card-title>
          <v-card-text>
            <v-textarea
              v-model="htmlInput"
              label="Paste the HTML content here"
              rows="10"
              class="textarea-custom"
              placeholder="Right-click the welcome page, select 'View Page Source', then copy and paste all the content here..."
            ></v-textarea>
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-spacer></v-spacer>
            <v-btn
              color="error"
              @click="showHTMLDialog = false"
              class="navbar-btn"
            >
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              @click="processHTML"
              :disabled="!htmlInput"
              class="navbar-btn"
            >
              Submit
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>
  </v-container>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useTheme } from 'vuetify/lib/framework.mjs';
import axios from 'axios';
import { io } from 'socket.io-client';

const theme = useTheme();
const themeColors = theme.themes.value.customTheme.colors;

const pairingDialog = ref(false);
const activeStep = ref('1');
const showHTMLDialog = ref(false);
const htmlInput = ref('');

// Add the server info ref
const serverInfo = ref(null);

// Store the auth token
const currentAuthToken = ref('');

// Add these new refs
const isPairingInProgress = ref(false);
const serverReadyMessage = ref('');
const checkStatusInterval = ref(null);

// Add a new ref to track if we're in restart mode
const isRestartMode = ref(false);

const steps = [
  {
    title: 'Login',
    value: '1',
  },
  {
    title: 'Copy',
    value: '2',
  },
  {
    title: 'Pair',
    value: '3',
  },
  {
    title: 'Confirm',
    value: '4',
  }
];

// Remove the debug watcher
watch(activeStep, (newValue, oldValue) => {
  // Only log step changes for important transitions
  if (newValue === '3' || newValue === '4') {
    console.log(`Advancing to step ${newValue}`);
  }
});

// Add socket connection
const socket = io();

// Set up socket listeners
onMounted(() => {
  // Listen for pairing completion
  socket.on('pairingComplete', (data) => {
    // Keep only essential logging
    if (data.success && data.data && data.data.pairingData) {
      // Store the server info
      serverInfo.value = data.data.pairingData;
      
      // Only automatically advance if we're not in restart mode and still on step 3
      if (!isRestartMode.value && activeStep.value === '3') {
        // Move to confirmation step
        activeStep.value = '4';
      } else if (isRestartMode.value) {
        // If in restart mode, also advance to step 4 to show the updated server info
        activeStep.value = '4';
        // Reset restart mode after handling
        isRestartMode.value = false;
      }
    } else {
      console.error('Pairing complete but missing data');
    }
  });
  
  // Listen for pairing errors
  socket.on('pairingError', (data) => {
    console.error('Pairing error:', data);
  });
});

// Clean up listeners on unmount
onUnmounted(() => {
  socket.off('pairingComplete');
  socket.off('pairingError');
  
  if (checkStatusInterval.value) {
    clearInterval(checkStatusInterval.value);
  }
});

async function processHTML() {
  if (!htmlInput.value) return;

  try {
    const match = htmlInput.value.match(/postMessage\('(.+?)'\)/);
    if (!match) throw new Error('Auth data not found in HTML');

    const jsonString = match[1].replace(/\\"/g, '"');
    const authData = JSON.parse(jsonString);
    currentAuthToken.value = authData.Token; // Save this for reuse
    
    try {
      showHTMLDialog.value = false;
      isPairingInProgress.value = true;
      serverReadyMessage.value = 'Initializing connection with Rust+ servers...';
      
      // Start the registration process
      const response = await axios.post('/api/pairing/register', {
        authToken: authData.Token
      });

      if (response.data.success) {
        // Don't advance to step 3 yet, start polling for readiness
        startPollingStatus();
      } else {
        throw new Error('Pairing initialization failed');
      }
    } catch (error) {
      console.error('Registration failed:', error);
      isPairingInProgress.value = false;
    }
  } catch (error) {
    console.error('Failed to process HTML:', error);
  }
}

function startPairing() {
  console.log('Starting pairing process...');
  activeStep.value = '1';
  pairingDialog.value = true;
}

function openSteamLogin() {
  const popupFeatures = [
    'width=800',
    'height=600',
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'scrollbars=yes',
    'resizable=yes'
  ].join(',');

  try {
    const loginWindow = window.open(
      'https://companion-rust.facepunch.com/login',
      'RustPlusLogin',
      popupFeatures
    );

    if (loginWindow === null) {
      // Check if the window was actually created and accessible
      try {
        // This will throw if the window was blocked
        loginWindow.focus();
      } catch (e) {
        // Handle popup blockage
      }
    }
  } catch (error) {
    console.error('Failed to open login window:', error);
  }
}

function promptForHTML() {
  showHTMLDialog.value = true;
}

// Add confirmation function
async function confirmPairing() {
  try {
    const saveResponse = await axios.post('/api/pairing/confirm', {
      serverInfo: serverInfo.value
    });
    
    if (saveResponse.data.success) {
      pairingDialog.value = false;
    } else {
      throw new Error('Failed to save server details');
    }
  } catch (error) {
    console.error('Failed to save server details:', error);
  }
}

// Add restart pairing function
async function restartPairing() {
  try {
    // Set restart mode to prevent auto-advancement
    isRestartMode.value = true;
    
    // Reset the server info
    serverInfo.value = null;
    
    // Go back to the pair step
    activeStep.value = '3';
    
    // Call the restart endpoint
    const restartResponse = await axios.post('/api/pairing/restart');
    
    if (restartResponse.data.success) {
      // Reset restart mode on success
      isRestartMode.value = false;
    } else {
      throw new Error('Failed to restart FCM listener');
    }
  } catch (error) {
    console.error('Failed to restart pairing:', error);
    // Reset restart mode on error too
    isRestartMode.value = false;
  }
}

// Add function to start polling
function startPollingStatus() {
  // Clear any existing interval
  if (checkStatusInterval.value) {
    clearInterval(checkStatusInterval.value);
  }
  
  // Start polling every 2 seconds
  checkStatusInterval.value = setInterval(async () => {
    try {
      const statusResponse = await axios.get('/api/pairing/status');
      
      if (statusResponse.data.success) {
        serverReadyMessage.value = statusResponse.data.message;
        
        if (statusResponse.data.status === 'ready') {
          // Server is ready, advance to step 3
          clearInterval(checkStatusInterval.value);
          isPairingInProgress.value = false;
          activeStep.value = '3';
        }
      }
    } catch (error) {
      console.error('Failed to check pairing status:', error);
    }
  }, 2000);
}
</script>