<!-- Settings.vue -->
<template>
  <div class="settings-container">
    <!-- Loading state -->
    <div v-if="isLoading" :style="getBoxStyle()">
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
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
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
  getButtonStyle 
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
const rustplusStatus = ref({
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null
});
const socket = io();

onMounted(async () => {
  // Load server data if it exists
  try {
    const response = await axios.get('/api/pairing/current');
    if (response.data.success && response.data.data) {
      serverData.value = response.data.data;
      
      // Get RustPlus status
      await loadRustPlusStatus();
    }
    // Set loading to false regardless of whether we found server data
    isLoading.value = false;
  } catch (error) {
    console.error('Failed to load server data:', error);
    isLoading.value = false;
  }
  
  // Set up socket listeners for RustPlus status updates
  socket.on('rustplusStatus', (status) => {
    rustplusStatus.value = status;
  });
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

// Connect or disconnect from the Rust+ server
async function toggleRustPlusConnection() {
  try {
    if (rustplusStatus.value.connected) {
      // Disconnect logic (if we add this later)
      console.log('Disconnect not implemented yet');
    } else {
      // Connect to Rust+ server
      const response = await axios.post('/api/rustplus/connect');
      if (response.data.success) {
        console.log('RustPlus connection initiated');
      } else {
        console.error('Failed to connect to RustPlus:', response.data.error);
      }
    }
  } catch (error) {
    console.error('Failed to toggle RustPlus connection:', error);
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

function disconnectServer() {
  showConfirmDialog.value = true;
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
</style>