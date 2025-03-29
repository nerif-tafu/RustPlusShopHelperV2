import axios from 'axios';
import { ref, readonly, reactive, computed } from 'vue';

// State (using reactive for objects, ref for primitives)
const state = reactive({
  connected: false,
  serverInfo: null,
  error: null,
  loading: false,
  lastUpdated: null
});

// Computed values
const status = computed(() => ({
  connected: state.connected,
  serverInfo: state.serverInfo,
  error: state.error,
  loading: state.loading,
  lastUpdated: state.lastUpdated
}));

// Actions
async function checkConnection() {
  try {
    state.loading = true;
    const response = await axios.get('/api/rustplus/status');
    
    if (response.data.success) {
      state.connected = response.data.data.connected;
      state.serverInfo = response.data.data.serverInfo || null;
      state.error = null;
    } else {
      state.connected = false;
      state.error = response.data.error || 'Unknown error';
    }
    
    state.lastUpdated = new Date();
    return status.value;
  } catch (err) {
    state.connected = false;
    state.error = err.message || 'Network error';
    return status.value;
  } finally {
    state.loading = false;
  }
}

async function connect(serverDetails) {
  try {
    state.loading = true;
    const response = await axios.post('/api/rustplus/connect', serverDetails);
    
    if (response.data.success) {
      state.connected = true;
      state.serverInfo = response.data.data.serverInfo || null;
      state.error = null;
    } else {
      state.connected = false;
      state.error = response.data.error || 'Failed to connect';
    }
    
    state.lastUpdated = new Date();
    return status.value;
  } catch (err) {
    state.connected = false;
    state.error = err.message || 'Network error';
    return status.value;
  } finally {
    state.loading = false;
  }
}

async function disconnect() {
  try {
    state.loading = true;
    const response = await axios.post('/api/rustplus/disconnect');
    
    if (response.data.success) {
      state.connected = false;
      state.serverInfo = null;
      state.error = null;
    } else {
      state.error = response.data.error || 'Failed to disconnect';
    }
    
    state.lastUpdated = new Date();
    return status.value;
  } catch (err) {
    state.error = err.message || 'Network error';
    return status.value;
  } finally {
    state.loading = false;
  }
}

// Use readonly to prevent direct state mutation from components
export const rustPlusService = {
  // State (readonly to prevent direct mutation)
  state: readonly(state),
  
  // Computed
  status,
  
  // Getter functions
  isConnected: () => state.connected,
  
  // Actions
  checkConnection,
  connect,
  disconnect,
  
  // Update connection status - allows components to update the state indirectly
  updateConnectionStatus(isConnected, statusData = {}) {
    state.connected = isConnected;
    if (statusData.serverInfo) {
      state.serverInfo = statusData.serverInfo;
    }
    if (statusData.error) {
      state.error = statusData.error;
    }
    state.lastUpdated = new Date();
  }
}; 