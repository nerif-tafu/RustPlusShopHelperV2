<!-- Settings.vue -->
<template>
  <div class="settings-container">
    <!-- Loading state -->
    <div v-if="isLoading && !steamLoginForm.showForm" :style="getBoxStyle()">
      <div class="d-flex align-center mb-4">
        <div class="skeleton-title" :style="getSkeletonStyle()"></div>
      </div>
      
      <div class="server-details mb-4" :style="getServerBoxStyle()">
        <div class="pa-4">
          <div class="skeleton-subtitle mb-3" :style="getSkeletonStyle()"></div>
          
          <v-divider class="my-3"></v-divider>
          
          <div class="connection-info-grid">
            <div class="connection-details">
              <div class="skeleton-label mb-1" :style="getSkeletonStyle()"></div>
              <div class="skeleton-text mb-3" :style="getSkeletonStyle()"></div>
              
              <div class="skeleton-label mb-1 mt-3" :style="getSkeletonStyle()"></div>
              <div class="skeleton-text mb-3" :style="getSkeletonStyle()"></div>
            </div>
            
            <div class="connection-statuses">
              <div class="skeleton-label mb-1" :style="getSkeletonStyle()"></div>
              <div class="skeleton-chip mb-3" :style="getSkeletonChipStyle()"></div>
              
              <div class="skeleton-label mb-1 mt-3" :style="getSkeletonStyle()"></div>
              <div class="skeleton-chip mb-3" :style="getSkeletonChipStyle()"></div>
              
              <div class="skeleton-label mb-1 mt-3" :style="getSkeletonStyle()"></div>
              <div class="skeleton-chip mb-3" :style="getSkeletonChipStyle()"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- When server is paired -->
    <div v-else-if="serverData" :style="getBoxStyle()">
      <div class="d-flex justify-space-between align-center mb-4">
        <h2 :style="getTitleStyle()">Server Connection</h2>
        <v-btn
          size="small"
          color="primary"
          :style="getButtonStyle()"
          @click="startPairing"
        >
          <v-icon left class="pr-2">mdi-refresh</v-icon>
          Pair Different Server
        </v-btn>
      </div>
      
      <div class="server-details mb-4" :style="getServerBoxStyle()">
        <div class="pa-4">
          <div class="text-h6 mb-1 d-flex align-center" :style="getTitleStyle()">
            {{ serverData.serverName }}
          </div>
          
          <v-divider class="my-3"></v-divider>
          
          <!-- Connection information in a more organized layout -->
          <div class="connection-info-grid">
            <!-- Left column - Server details -->
            <div class="connection-details">
              <div class="detail-row">
                <v-icon size="small" class="mr-2">mdi-server</v-icon>
                <div class="text-caption" :style="getCaptionStyle()">Server Address</div>
              </div>
              <div class="detail-value" :style="getNormalTextStyle()">{{ serverData.serverIP }}:{{ serverData.appPort }}</div>
              
              <div class="detail-row mt-3">
                <v-icon size="small" class="mr-2">mdi-steam</v-icon>
                <div class="text-caption" :style="getCaptionStyle()">Steam ID</div>
              </div>
              <div class="detail-value" :style="getNormalTextStyle()">{{ serverData.steamID }}</div>
            </div>
            
            <!-- Right column - Status indicators -->
            <div class="connection-statuses">
              <!-- Rust+ Connection Status -->
              <div class="status-row">
                <div class="status-label" :style="getCaptionStyle()">Rust+ Connection</div>
                <div class="status-indicator">
                  <v-chip
                    size="small"
                    :color="rustplusStatus.connected ? 'success' : 'error'"
                    class="status-chip"
                  >
                    <v-icon size="x-small" start>
                      {{ rustplusStatus.connected ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                    </v-icon>
                    {{ rustplusStatus.connected ? 'Connected' : 'Disconnected' }}
                  </v-chip>
                </div>
                <div v-if="rustplusStatus.lastConnected" class="text-caption" :style="getCaptionStyle()">
                  Last connected: {{ formatDate(rustplusStatus.lastConnected) }}
                </div>
              </div>
              
              <!-- FCM Status (Placeholder) -->
              <div class="status-row mt-3">
                <div class="status-label" :style="getCaptionStyle()">FCM Connection</div>
                <div class="status-indicator">
                  <v-chip
                    size="small"
                    color="success"
                    class="status-chip"
                  >
                    <v-icon size="x-small" start>mdi-check-circle</v-icon>
                    Placeholder
                  </v-chip>
                </div>
              </div>
              
              <!-- Expo Status (Placeholder) -->
              <div class="status-row mt-3">
                <div class="status-label" :style="getCaptionStyle()">Expo Notifications</div>
                <div class="status-indicator">
                  <v-chip
                    size="small"
                    color="warning"
                    class="status-chip"
                  >
                    <v-icon size="x-small" start>mdi-clock-outline</v-icon>
                    Placeholder
                  </v-chip>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Server Information Section -->
          <v-divider class="my-4"></v-divider>
          <div v-if="rustplusStatus.connected && rustplusStatus.serverInfo">
            <div class="section-title mb-2" :style="getCaptionStyle()">Server Information</div>
            <div class="server-info-grid mt-2">
              <div class="server-info-item">
                <div class="text-caption" :style="getCaptionStyle()">Players</div>
                <div class="server-info-value" :style="getNormalTextStyle()">
                  {{ rustplusStatus.serverInfo.players }}/{{ rustplusStatus.serverInfo.maxPlayers }}
                </div>
              </div>
              
              <div class="server-info-item">
                <div class="text-caption" :style="getCaptionStyle()">Wipe Date</div>
                <div class="server-info-value" :style="getNormalTextStyle()">
                  {{ formatDate(new Date(rustplusStatus.serverInfo.wipeTime * 1000), true) }}
                </div>
              </div>
              
              <div class="server-info-item">
                <div class="text-caption" :style="getCaptionStyle()">Map</div>
                <div class="server-info-value" :style="getNormalTextStyle()">
                  {{ rustplusStatus.serverInfo.map }}
                </div>
              </div>
              
              <div class="server-info-item">
                <div class="text-caption" :style="getCaptionStyle()">Map Size</div>
                <div class="server-info-value" :style="getNormalTextStyle()">
                  {{ rustplusStatus.serverInfo.mapSize }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- When no server is paired -->
    <div v-else-if="!isLoading && !serverData" :style="getBoxStyle()">
      <h2 :style="getTitleStyle()" class="mb-4">Server Connection Settings</h2>
      <p :style="getNormalTextStyle()" class="mb-4">
        You need to pair with a Rust server to start using the app features. 
        Click the button below and follow the steps to complete the pairing process.
      </p>
      <v-btn
        color="primary"
        class="mt-4"
        :style="getButtonStyle()"
        @click="startPairing"
      >
        <v-icon left class="pr-2">mdi-link-variant</v-icon>
        Pair with Server
      </v-btn>
    </div>
    
    <!-- Server Pairing Component -->
    <ServerPairing 
      v-model="showPairingDialog"
      @pairing-completed="onPairingCompleted"
      ref="pairingComponent"
    />
    
    <!-- Confirmation Dialog -->
    <v-dialog v-model="showConfirmDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h5">Disconnect Server?</v-card-title>
        <v-card-text>
          Are you sure you want to disconnect from this server? You'll need to pair again to reconnect.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="grey-darken-1"
            variant="text"
            @click="showConfirmDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="error"
            variant="text"
            @click="confirmDisconnect"
          >
            Disconnect
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    
    <!-- Item Database Status Section -->
    <v-divider class="my-4"></v-divider>
    <div class="database-status-section mb-4" :style="getBoxStyle()">
      <div class="pa-4">
        <div class="d-flex justify-space-between align-center mb-3">
          <div class="text-h6" :style="getTitleStyle()">Item Database</div>
          <div>
            <v-btn
              color="error"
              size="small"
              @click="confirmResetDatabase"
              class="mr-2"
              :style="getButtonStyle()"
            >
              <v-icon class="mr-1">mdi-delete</v-icon>
              Reset
            </v-btn>
            <v-btn
              color="primary"
              size="small"
              @click="updateItemDatabase"
              :loading="isUpdatingDatabase && progressInfo.progress !== 100"
              :disabled="isUpdatingDatabase && progressInfo.progress !== 100"
              :style="getButtonStyle()"
            >
              <v-icon class="mr-1">mdi-refresh</v-icon>
              Update
            </v-btn>
          </div>
        </div>
        
        <div class="mb-2 schedule-note">
          <small :style="getCaptionStyle()">
            <v-icon small>mdi-information-outline</v-icon>
            Automatic updates occur on the first Thursday of each month at 8PM GMT
          </small>
        </div>
        
        <div v-if="isLoadingDatabase && !steamLoginForm.showForm" class="d-flex align-center my-4">
          <v-progress-circular indeterminate color="primary" class="mr-3"></v-progress-circular>
          <div :style="getNormalTextStyle()">Loading database status...</div>
        </div>
        
        <div v-else-if="databaseStats.error" class="error-message pa-3" :style="getErrorStyle()">
          {{ databaseStats.error }}
        </div>
        
        <div v-if="!isLoadingDatabase" class="database-info">
          <div class="d-flex mb-2">
            <v-icon class="mr-2">mdi-steam</v-icon>
            <span :style="getNormalTextStyle()">
              <strong>Steam Login:</strong> {{ steamLoginStatus.loggedIn ? `Signed in as ${steamLoginStatus.username}` : 'Signed Out' }}
            </span>
          </div>

          <div class="d-flex mb-2">
            <v-icon class="mr-2">mdi-database</v-icon>
            <span :style="getNormalTextStyle()">
              <strong>Items:</strong> {{ databaseStats.itemCount || 'No items' }}
            </span>
          </div>
          
          <div class="d-flex mb-2" v-if="databaseStats.lastUpdated">
            <v-icon class="mr-2">mdi-clock-outline</v-icon>
            <span :style="getNormalTextStyle()">
              <strong>Last Updated:</strong> {{ formatDate(databaseStats.lastUpdated) }}
            </span>
          </div>
          
          <div v-if="progressInfo.active" class="progress-section mt-3">
            <div class="d-flex justify-space-between mb-2">
              <div>{{ progressInfo.message }}</div>
              <div>{{ progressInfo.progress }}%</div>
            </div>
            <v-progress-linear 
              :value="progressInfo.progress"
              :color="getProgressColor(progressInfo.progress)"
              height="8"
            ></v-progress-linear>
          </div>
          
          <!-- Show the database info or login form based on state -->
          <div v-if="steamLoginForm.showForm" class="pa-4" :style="getServerBoxStyle()">
            <h3 :style="getSubtitleStyle()" class="mb-3">Steam Login Required</h3>
            <p :style="getNormalTextStyle()">{{ steamLoginStatus.message }}</p>
            
            <v-form @submit.prevent="handleSteamLogin" class="mt-4">
              <v-text-field
                v-model="steamLoginForm.username"
                label="Steam Username"
                variant="outlined"
                :disabled="steamLoginForm.loading"
                required
              ></v-text-field>
              
              <v-text-field
                v-model="steamLoginForm.password"
                label="Steam Password"
                type="password"
                variant="outlined"
                :disabled="steamLoginForm.loading"
                required
              ></v-text-field>
              
              <v-btn
                type="submit"
                color="primary"
                :loading="steamLoginForm.loading"
                :disabled="steamLoginForm.loading"
                class="mt-3"
              >
                Login to Steam
              </v-btn>
            </v-form>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Reset Database Confirmation Dialog -->
    <v-dialog v-model="showResetConfirmDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h5">Reset Database?</v-card-title>
        <v-card-text>
          <p class="mb-2">This will delete ALL downloaded data including:</p>
          <ul class="mb-4">
            <li>All item images</li>
            <li>Downloaded Rust client files</li>
            <li>Steam credentials & login cache</li>
            <li>Item database</li>
          </ul>
          <p class="text-error">This action cannot be undone!</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="grey-darken-1"
            variant="text"
            @click="showResetConfirmDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="error"
            variant="text"
            @click="resetDatabase"
            :loading="isResetting"
          >
            Reset Database
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    </div>
  </template>
  
  <script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { io } from 'socket.io-client';
import ServerPairing from './ServerPairing.vue';
import axios from 'axios';
import { useStyleUtils } from '@/utils/styleUtils';
import { useTheme } from 'vuetify';

// Import shared style utilities
const { 
  getBoxStyle, 
  getServerBoxStyle, 
  getTitleStyle, 
  getNormalTextStyle, 
  getCaptionStyle, 
  getButtonStyle,
  getErrorStyle,
  getSubtitleStyle
} = useStyleUtils();

// Custom skeleton loader styling functions
const getSkeletonStyle = () => {
  const theme = useTheme();
  const themeColors = theme.themes.value.customTheme.colors;
  return {
    backgroundColor: themeColors['cell-bg-lighter'],
    opacity: 0.7,
    animation: 'pulse 1.5s infinite ease-in-out',
  };
};

const getSkeletonChipStyle = () => {
  const theme = useTheme();
  const themeColors = theme.themes.value.customTheme.colors;
  return {
    backgroundColor: themeColors['cell-bg-lighter'],
    opacity: 0.7,
    animation: 'pulse 1.5s infinite ease-in-out',
    borderRadius: '16px',
  };
};

const showPairingDialog = ref(false);
const pairingComponent = ref(null);
const serverData = ref(null);
const showConfirmDialog = ref(false);
const isLoading = ref(true);
const isLoadingDatabase = ref(false);
const rustplusStatus = ref({
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null
});
const socket = io();

// Item database status
const databaseStats = ref({
  loading: true,
  itemCount: 0,
  lastUpdated: null,
  error: null
});

const isUpdatingDatabase = ref(false);
const progressInfo = ref({
  active: false,
  progress: 0,
  message: ''
});

// Add Steam login form state
const steamLoginForm = ref({
  username: '',
  password: '',
  loading: false,
  showForm: false
});

// Add the following to your data section
const steamLoginStatus = ref({
  loggedIn: false,
  username: '',
  message: ''
});

const errorMessage = ref('');

// Add these variables
const showResetConfirmDialog = ref(false);
const isResetting = ref(false);

onMounted(async () => {
  try {
    // Make sure the socket connection is working
    socket.on('connect', () => {
      console.log('Socket connected!', socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
    
    // Set up the listener for item database progress
    socket.on('itemDatabaseProgress', (data) => {
      console.log('Received database progress update:', data);
      progressInfo.value = {
        active: true,
        progress: data.progress,
        message: data.message
      };
      
      // If progress is 100%, we're done - wait a moment then set active to false
      if (data.progress >= 100) {
        setTimeout(() => {
          progressInfo.value.active = false;
          isUpdatingDatabase.value = false;
          // Refresh the database stats after update is complete
          fetchDatabaseStatus();
        }, 2000); // Show 100% for 2 seconds before hiding
      }
    });
    
    // Important: Fetch both server data and database status on component mount
    await Promise.all([
      checkSteamLoginStatus().catch(err => console.error('Error checking Steam login:', err)),
      fetchServerData().catch(err => console.error('Error fetching server data:', err)),
      fetchDatabaseStatus().catch(err => console.error('Error fetching database status:', err))
    ]);
    
  } catch (error) {
    console.error('Error initializing component:', error);
  } finally {
    isLoading.value = false;
  }
});

onUnmounted(() => {
  // Remove socket listeners
  socket.off('rustplusStatus');
});

// Format a date for display
function formatDate(date, shortFormat = false) {
  if (!date) return 'Unknown';
  
  const dateObj = new Date(date);
  
  if (shortFormat) {
    // Short format: 28/03/2025
    return dateObj.toLocaleDateString();
  } else {
    // Full format: 28/03/2025, 21:11:08
    return dateObj.toLocaleString();
  }
}

// Load the RustPlus connection status
async function loadRustPlusStatus() {
  try {
    const response = await axios.get('/api/rustplus/status');
    if (response.data.success) {
      rustplusStatus.value = response.data.data;
    }
  } catch (error) {
    console.error('Failed to load RustPlus status:', error);
  }
}

function startPairing() {
  console.log('Starting pairing process...');
  if (pairingComponent.value) {
    pairingComponent.value.resetComponent();
  }
  showPairingDialog.value = true;
}

function onPairingCompleted(serverInfo) {
  console.log('Server pairing completed:', serverInfo);
  // Refresh server data from the server
  loadServerData();
}

async function loadServerData() {
  try {
    const response = await axios.get('/api/pairing/current');
    if (response.data.success && response.data.data) {
      serverData.value = response.data.data;
      
      // Re-initialize RustPlus connection
      await axios.post('/api/rustplus/connect');
      await loadRustPlusStatus();
    }
  } catch (error) {
    console.error('Failed to load server data:', error);
  }
}

async function confirmDisconnect() {
  try {
    const response = await axios.post('/api/pairing/disconnect');
    if (response.data.success) {
      serverData.value = null;
      rustplusStatus.value = {
        connected: false,
        lastConnected: null,
        lastError: null,
        serverInfo: null
      };
    }
    showConfirmDialog.value = false;
  } catch (error) {
    console.error('Failed to disconnect server:', error);
  }
}

// Fetch database status
const fetchDatabaseStatus = async () => {
  console.log('Fetching database status...');
  try {
    isLoadingDatabase.value = true;
    
    // Get database stats from the API
    const response = await axios.get('/api/items');
    if (response.data.success) {
      console.log('Received database stats:', response.data.data);
      databaseStats.value = response.data.data || { itemCount: 0, lastUpdated: null };
    } else {
      console.error('API returned success: false for database stats');
      databaseStats.value.error = 'Failed to load database stats';
    }
  } catch (error) {
    console.error('Error fetching database status:', error);
    databaseStats.value.error = error.message || 'Failed to load database stats';
  } finally {
    isLoadingDatabase.value = false;
  }
};

// Update item database
const updateItemDatabase = async () => {
  console.log('Updating item database...', isUpdatingDatabase.value);
  // Reset the updating flag in case it's stuck from a previous attempt
  isUpdatingDatabase.value = false;
  
  isUpdatingDatabase.value = true;
  
  // Reset progress
  progressInfo.value = {
    active: true,
    progress: 5,
    message: 'Starting database update...'
  };

  console.log('Checking Steam login status...');
  
  // First check if the user is logged into Steam
  try {
    const steamCheckResponse = await axios.get('/api/steam/login-status');
    console.log('Steam login status:', steamCheckResponse.data);
    
    if (!steamCheckResponse.data.loggedIn) {
      progressInfo.value.message = 'Steam login required: ' + steamCheckResponse.data.message;
      steamLoginForm.value.showForm = true;
      isUpdatingDatabase.value = false;
      return;
    }
  } catch (error) {
    console.error('Error checking Steam login status:', error);
    progressInfo.value = {
      active: true,
      progress: 0,
      message: `Error: ${error.message}`
    };
    isUpdatingDatabase.value = false;
    return;
  }
  
  try {
    // Start the database update
    const response = await axios.post('/api/items/update', {}, {
      onUploadProgress: (progressEvent) => {
        // This will only catch the initial request progress, not the server-side updates
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        progressInfo.value.progress = Math.min(10, percent); // Cap at 10% for request phase
      }
    });
    
    console.log('Database update started:', response.data);
    
    // We'll let the socket events handle the progress updates and completion
    // Don't set progressInfo.active = false here
    
    // Reload the database stats when done
    // await fetchDatabaseStatus();
    
  } catch (error) {
    console.error('Error updating database:', error);
    progressInfo.value = {
      active: true,
      progress: 0,
      message: `Error updating database: ${error.response?.data?.error || error.message}`
    };
    // Log more details for debugging
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    isUpdatingDatabase.value = false;
  }
};

function getProgressColor(progress) {
  if (progress < 30) return 'red';
  if (progress < 70) return 'orange';
  return 'green';
}

// Improve the Steam login handler to automatically start the database update after successful login
async function handleSteamLogin() {
  try {
    steamLoginForm.value.loading = true;
    
    const response = await axios.post('/api/steam/login', {
      username: steamLoginForm.value.username,
      password: steamLoginForm.value.password
    });
    
    if (response.data.success) {
      // Login successful - clear the form
      steamLoginForm.value.username = '';
      steamLoginForm.value.password = '';
      steamLoginForm.value.showForm = false;
      
      // Show success message
      progressInfo.value = {
        active: true,
        progress: 20,
        message: 'Steam login successful! Starting database update...'
      };
      
      // After a short delay, start the database update
      setTimeout(() => {
        updateItemDatabase();
      }, 1000);
      
      // Refresh the login status
      refreshLoginStatus();
    } else {
      // Login failed
      progressInfo.value = {
        active: true,
        progress: 0,
        message: `Steam login failed: ${response.data.error || 'Unknown error'}`
      };
    }
  } catch (error) {
    console.error('Error during Steam login:', error);
    progressInfo.value = {
      active: true,
      progress: 0,
      message: `Error: ${error.response?.data?.error || error.message || 'Unknown error during login'}`
    };
  } finally {
    steamLoginForm.value.loading = false;
  }
}

// Add this method to check Steam login status
async function checkSteamLoginStatus() {
  try {
    const response = await axios.get('/api/steam/login-status');
    steamLoginStatus.value = response.data;
    console.log('Steam login status:', steamLoginStatus.value);
  } catch (error) {
    console.error('Error checking Steam login status:', error);
  }
}

// You can also add a method to refresh the login status after successful login
function refreshLoginStatus() {
  checkSteamLoginStatus();
}

// Add this function to handle fetching server data
async function fetchServerData() {
  try {
    const response = await axios.get('/api/pairing/current');
    if (response.data.success && response.data.data) {
      serverData.value = response.data.data;
      
      // Get RustPlus status
      await loadRustPlusStatus();
    }
    return serverData.value;
  } catch (error) {
    console.error('Failed to load server data:', error);
    return null;
  }
}

// Add functions for database reset
function confirmResetDatabase() {
  showResetConfirmDialog.value = true;
}

async function resetDatabase() {
  try {
    isResetting.value = true;
    
    // Call the API to reset the database
    const response = await axios.post('/api/items/reset');
    
    if (response.data.success) {
      progressInfo.value = {
        active: true,
        progress: 100,
        message: 'Database successfully reset!'
      };
      
      // Reset steam login status
      steamLoginStatus.value = {
        loggedIn: false,
        username: '',
        message: 'Steam login required'
      };
      
      // Clear database stats
      databaseStats.value = {
        itemCount: 0,
        lastUpdated: null,
        error: null
      };
      
      // Show the login form
      steamLoginForm.value.showForm = true;
      
      // Hide the progress after a delay
      setTimeout(() => {
        progressInfo.value.active = false;
      }, 3000);
    } else {
      progressInfo.value = {
        active: true,
        progress: 0,
        message: `Reset failed: ${response.data.error || 'Unknown error'}`
      };
    }
  } catch (error) {
    console.error('Error resetting database:', error);
    progressInfo.value = {
      active: true,
      progress: 0,
      message: `Error: ${error.response?.data?.error || error.message}`
    };
  } finally {
    isResetting.value = false;
    showResetConfirmDialog.value = false;
  }
}

  </script>

<style scoped>
.settings-container {
  padding: 16px;
}

/* Skeleton loading styles */
.skeleton-title {
  height: 28px;
  width: 200px;
  border-radius: 4px;
}

.skeleton-subtitle {
  height: 22px;
  width: 300px;
  border-radius: 4px;
}

.skeleton-label {
  height: 16px;
  width: 120px;
  border-radius: 4px;
}

.skeleton-text {
  height: 18px;
  width: 180px;
  border-radius: 4px;
  margin-left: 26px;
}

.skeleton-chip {
  height: 24px;
  width: 120px;
  border-radius: 16px;
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    opacity: 0.6;
  }
}

.text-error {
  color: #ff5252;
}

/* New grid layouts for connection info */
.connection-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.detail-row {
  display: flex;
  align-items: center;
}

.detail-value {
  margin-top: 4px;
  margin-left: 26px;
}

.status-row {
  margin-bottom: 8px;
}

.status-label {
  margin-bottom: 4px;
}

.status-indicator {
  display: flex;
  align-items: center;
}

.status-chip {
  font-size: 12px;
}

/* Server info grid */
.server-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.server-info-item {
  padding: 8px;
}

.server-info-value {
  margin-top: 4px;
}

.section-title {
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 12px;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .connection-info-grid {
    grid-template-columns: 1fr;
  }
  
  .server-info-grid {
    grid-template-columns: 1fr;
  }
}

.error-message {
  background-color: rgba(244, 67, 54, 0.1);
  border-radius: 4px;
  color: #f44336;
}

.progress-section {
  background-color: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  padding: 12px;
}
</style>