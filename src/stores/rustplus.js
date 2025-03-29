import { defineStore } from 'pinia';
import axios from 'axios';
import { ref, computed } from 'vue';

export const useRustPlusStore = defineStore('rustplus', () => {
  // State
  const connected = ref(false);
  const serverInfo = ref(null);
  const error = ref(null);
  const loading = ref(false);
  const lastUpdated = ref(null);
  
  // Status object that combines connection state and error information
  const status = computed(() => ({
    connected: connected.value,
    serverInfo: serverInfo.value,
    error: error.value,
    loading: loading.value,
    lastUpdated: lastUpdated.value
  }));
  
  // Actions
  async function checkConnection() {
    try {
      loading.value = true;
      const response = await axios.get('/api/rustplus/status');
      
      if (response.data.success) {
        connected.value = response.data.data.connected;
        serverInfo.value = response.data.data.serverInfo || null;
        error.value = null;
      } else {
        connected.value = false;
        error.value = response.data.error || 'Unknown error';
      }
      
      lastUpdated.value = new Date();
      return status.value;
    } catch (err) {
      connected.value = false;
      error.value = err.message || 'Network error';
      return status.value;
    } finally {
      loading.value = false;
    }
  }
  
  async function connect(serverDetails) {
    try {
      loading.value = true;
      const response = await axios.post('/api/rustplus/connect', serverDetails);
      
      if (response.data.success) {
        connected.value = true;
        serverInfo.value = response.data.data.serverInfo || null;
        error.value = null;
      } else {
        connected.value = false;
        error.value = response.data.error || 'Failed to connect';
      }
      
      lastUpdated.value = new Date();
      return status.value;
    } catch (err) {
      connected.value = false;
      error.value = err.message || 'Network error';
      return status.value;
    } finally {
      loading.value = false;
    }
  }
  
  async function disconnect() {
    try {
      loading.value = true;
      const response = await axios.post('/api/rustplus/disconnect');
      
      if (response.data.success) {
        connected.value = false;
        serverInfo.value = null;
        error.value = null;
      } else {
        error.value = response.data.error || 'Failed to disconnect';
      }
      
      lastUpdated.value = new Date();
      return status.value;
    } catch (err) {
      error.value = err.message || 'Network error';
      return status.value;
    } finally {
      loading.value = false;
    }
  }
  
  // Return store properties and methods
  return {
    // State
    connected,
    serverInfo,
    error,
    loading,
    lastUpdated,
    
    // Computed
    status,
    
    // Actions
    checkConnection,
    connect,
    disconnect
  };
}); 