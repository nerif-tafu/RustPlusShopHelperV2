<template>
  <div>
    <!-- Pairing Dialog -->
    <v-dialog v-model="dialogVisible" max-width="600" @update:model-value="$emit('update:modelValue', $event)">
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
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import axios from 'axios';
import { io } from 'socket.io-client';

const props = defineProps({
  modelValue: Boolean,
});

const emit = defineEmits(['update:modelValue', 'pairing-completed']);

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const activeStep = ref('1');
const showHTMLDialog = ref(false);
const htmlInput = ref('');
const serverInfo = ref(null);
const currentAuthToken = ref('');
const isPairingInProgress = ref(false);
const serverReadyMessage = ref('');
const checkStatusInterval = ref(null);
const isRestartMode = ref(false);

const steps = [
  { title: 'Login', value: '1' },
  { title: 'Copy', value: '2' },
  { title: 'Pair', value: '3' },
  { title: 'Confirm', value: '4' }
];

// Watch for step changes
watch(activeStep, (newValue, oldValue) => {
  if (newValue === '3' || newValue === '4') {
    console.log(`Advancing to step ${newValue}`);
  }
});

// Socket connection for real-time updates
const socket = io();

// Set up socket listeners
onMounted(() => {
  socket.on('pairingComplete', (data) => {
    if (data.success && data.data && data.data.pairingData) {
      serverInfo.value = data.data.pairingData;
      
      if (!isRestartMode.value && activeStep.value === '3') {
        activeStep.value = '4';
      } else if (isRestartMode.value) {
        activeStep.value = '4';
        isRestartMode.value = false;
      }
    } else {
      console.error('Pairing complete but missing data');
    }
  });
  
  socket.on('pairingError', (data) => {
    console.error('Pairing error:', data);
  });
});

// Clean up listeners
onUnmounted(() => {
  socket.off('pairingComplete');
  socket.off('pairingError');
  
  if (checkStatusInterval.value) {
    clearInterval(checkStatusInterval.value);
  }
});

// Process the HTML with auth data
async function processHTML() {
  if (!htmlInput.value) return;

  try {
    const match = htmlInput.value.match(/postMessage\('(.+?)'\)/);
    if (!match) throw new Error('Auth data not found in HTML');

    const jsonString = match[1].replace(/\\"/g, '"');
    const authData = JSON.parse(jsonString);
    currentAuthToken.value = authData.Token;
    
    try {
      showHTMLDialog.value = false;
      isPairingInProgress.value = true;
      serverReadyMessage.value = 'Initializing connection with Rust+ servers...';
      
      const response = await axios.post('/api/pairing/register', {
        authToken: authData.Token
      });

      if (response.data.success) {
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

// Open Steam login popup
function openSteamLogin() {
  const popupFeatures = [
    'width=800', 'height=600', 'menubar=no', 'toolbar=no',
    'location=no', 'status=no', 'scrollbars=yes', 'resizable=yes'
  ].join(',');

  try {
    const loginWindow = window.open(
      'https://companion-rust.facepunch.com/login',
      'RustPlusLogin',
      popupFeatures
    );

    if (loginWindow === null) {
      try {
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

// Confirm and save the pairing
async function confirmPairing() {
  try {
    const saveResponse = await axios.post('/api/pairing/confirm', {
      serverInfo: serverInfo.value
    });
    
    if (saveResponse.data.success) {
      dialogVisible.value = false;
      emit('pairing-completed', serverInfo.value);
    } else {
      throw new Error('Failed to save server details');
    }
  } catch (error) {
    console.error('Failed to save server details:', error);
  }
}

// Restart the pairing process
async function restartPairing() {
  try {
    isRestartMode.value = true;
    serverInfo.value = null;
    activeStep.value = '3';
    
    const restartResponse = await axios.post('/api/pairing/restart');
    
    if (!restartResponse.data.success) {
      throw new Error('Failed to restart FCM listener');
    }
  } catch (error) {
    console.error('Failed to restart pairing:', error);
    isRestartMode.value = false;
  }
}

// Poll for server readiness
function startPollingStatus() {
  if (checkStatusInterval.value) {
    clearInterval(checkStatusInterval.value);
  }
  
  checkStatusInterval.value = setInterval(async () => {
    try {
      const statusResponse = await axios.get('/api/pairing/status');
      
      if (statusResponse.data.success) {
        serverReadyMessage.value = statusResponse.data.message;
        
        if (statusResponse.data.status === 'ready') {
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

// Function to reset the component state
function resetComponent() {
  activeStep.value = '1';
  serverInfo.value = null;
  htmlInput.value = '';
  isPairingInProgress.value = false;
  isRestartMode.value = false;
  
  if (checkStatusInterval.value) {
    clearInterval(checkStatusInterval.value);
  }
}

// Expose methods to parent
defineExpose({
  resetComponent
});
</script> 