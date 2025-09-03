<template>
  <v-container>
    <!-- Header with shop prefix input -->
    <v-row>
      <v-col>
        <h2>Price Undercutter</h2>
        <v-row align="center">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="shopPrefix"
              label="Your Shop Prefix"
              placeholder="Enter your shop name prefix..."
              hide-details
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="3">
            <v-btn @click="saveShopPrefix" color="primary">Save & Refresh</v-btn>
          </v-col>
          <v-col cols="12" sm="3">
            <v-btn @click="refreshVendorData" color="secondary" :loading="isRefreshing">
              <v-icon left>mdi-refresh</v-icon>
              Refresh Data
            </v-btn>
          </v-col>
        </v-row>
      </v-col>
    </v-row>

    <!-- Error message display -->
    <v-row v-if="errorMessage">
      <v-col>
        <v-alert type="warning" closable @click:close="errorMessage = ''">
          <h4>Notice</h4>
          <p>{{ errorMessage }}</p>
          <v-btn v-if="rustplusStatus.connected" @click="loadVendingMachines" color="primary" size="small" class="mt-2">
            <v-icon>mdi-refresh</v-icon>
            Retry
          </v-btn>
        </v-alert>
      </v-col>
    </v-row>

    <!-- Shops summary -->
    <v-row>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-title>Your Shops</v-card-title>
          <v-card-text class="text-h3 text-center">{{ myShops.length }}</v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-title>Competitor Shops</v-card-title>
          <v-card-text class="text-h3 text-center">{{ competitorShops.length }}</v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card>
          <v-card-title>Items Undercut</v-card-title>
          <v-card-text class="text-h3 text-center">{{ undercutItems.length }}</v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Loading indicator -->
    <v-row v-if="isLoading">
      <v-col class="text-center">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
        <div>Loading data...</div>
      </v-col>
    </v-row>

    <!-- Connection error message -->
    <v-row v-else-if="!rustplusStatus.connected">
      <v-col>
        <v-alert type="error">
          <h3>Not Connected to Rust+</h3>
          <p>You need to connect to Rust+ to use the Undercutter feature.</p>
        </v-alert>
      </v-col>
    </v-row>

    <!-- No shops with prefix message -->
    <v-row v-else-if="myShops.length === 0 && shopPrefix">
      <v-col>
        <v-alert type="info">
          <h3>No Shops Found</h3>
          <p>No vending machines matching your shop prefix "{{ shopPrefix }}" were found.</p>
          <p>Check that your prefix is correct and that your shops are online and working.</p>
        </v-alert>
      </v-col>
    </v-row>

    <!-- No prefix set message -->
    <v-row v-else-if="!shopPrefix">
      <v-col>
        <v-alert type="info">
          <h3>Set Your Shop Prefix</h3>
          <p>Enter your shop name prefix above to identify which vending machines belong to you.</p>
        </v-alert>
      </v-col>
    </v-row>

    <!-- No undercuts message -->
    <v-row v-else-if="undercutItems.length === 0 && myShops.length > 0">
      <v-col>
        <v-alert type="success">
          <h3>No Undercuts Found</h3>
          <p>Great news! None of your items are being undercut by competitors.</p>
        </v-alert>
      </v-col>
    </v-row>

    <!-- Undercut items list -->
    <v-row v-else>
      <v-col>
        <h3 class="mb-4">Items Being Undercut</h3>
        <v-card v-for="listing in undercutItems" :key="`${listing.itemId}-${listing.allyShop.shopId}`" class="mb-5" theme="dark">
          <v-card-title class="text-primary">
            <v-img v-if="listing.itemImage" :src="listing.itemImage" @error="handleImageError" contain width="32" height="32" class="mr-2"></v-img>
            {{ listing.itemName }} - {{ listing.allyShop.shopName }}
          </v-card-title>

          <div class="pa-2">
            <v-table class="w-100" hover>
              <thead>
                <tr>
                  <th class="text-left">Shop</th>
                  <th class="text-left">Trade Details</th>
                  <th class="text-right">Items per Currency</th>
                </tr>
              </thead>
              <tbody>
                <!-- Your price row -->
                <tr>
                  <td>Your shop</td>
                  <td>
                    <div class="d-flex align-center">
                      <v-img v-if="listing.itemImage" :src="listing.itemImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      <v-icon v-else class="mr-1">mdi-package</v-icon>
                      ×{{ listing.allyShop.quantity }}
                      <v-icon class="mx-2">mdi-arrow-right</v-icon>
                      <v-img v-if="listing.allyShop.currencyImage" :src="listing.allyShop.currencyImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      <v-icon v-else class="mr-1">mdi-currency-usd</v-icon>
                      ×{{ listing.allyShop.price }}
                    </div>
                  </td>
                  <td class="text-right font-weight-bold">{{ calculateRatio(listing.allyShop.price, listing.allyShop.quantity) }}:1</td>
                </tr>
                
                <!-- Competitor rows -->
                <tr v-for="enemy in listing.enemyShops" :key="enemy.shopId">
                  <td class="text-purple-lighten-3">{{ enemy.shopName }}</td>
                  <td>
                    <div class="d-flex align-center">
                      <v-img v-if="listing.itemImage" :src="listing.itemImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      <v-icon v-else class="mr-1">mdi-package</v-icon>
                      ×{{ enemy.quantity || 1 }}
                      <v-icon class="mx-2">mdi-arrow-right</v-icon>
                      <v-img v-if="enemy.currencyImage" :src="enemy.currencyImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      <v-icon v-else class="mr-1">mdi-currency-usd</v-icon>
                      ×{{ enemy.price }}
                    </div>
                  </td>
                  <td class="text-right font-weight-bold">{{ calculateRatio(enemy.price, enemy.quantity || 1) }}:1</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Suggestion -->
          <v-card-text class="text-center text-cyan-accent-2">
            Change your cost to {{ getLowestEnemyPrice(listing) - 1 }} or less to match the competition.
            <br><small class="text-grey-lighten-1">Currently undercut by {{ listing.undercutPercentage }}%</small>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';

// State variables
const shopPrefix = ref(localStorage.getItem('shopPrefix') || '');
const isLoading = ref(true);
const undercutItems = ref([]);
const rustplusStatus = ref({ connected: false });
const myShops = ref([]);
const competitorShops = ref([]);
const errorMessage = ref('');
const retryCount = ref(0);
const maxRetries = 3;
const isRefreshing = ref(false);

// Setup socket connection
const socket = io(import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

// Initialize rustplus status
socket.on('connect', () => {
  console.log('Socket connected');
  // Request current status
  socket.emit('getStatus');
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
  rustplusStatus.value = { connected: false };
});

// Listen for connection status updates
socket.on('rustplusStatus', (status) => {
  rustplusStatus.value = status;
  
  // If just connected, refresh data
  if (status.connected) {
    loadVendingMachines();
  }
});

// Save the shop prefix to local storage
function saveShopPrefix() {
  localStorage.setItem('shopPrefix', shopPrefix.value);
  loadVendingMachines();
}

// Manually refresh vendor data from the server
async function refreshVendorData() {
  try {
    isRefreshing.value = true;
    errorMessage.value = '';
    
    // Call the server's refresh endpoint
    const response = await fetch('/api/rustplus/refresh-markers', {
      method: 'POST'
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log('Vendor data refreshed successfully');
        // Wait a moment for the data to update, then reload
        setTimeout(() => {
          loadVendingMachines();
        }, 1000);
      } else {
        console.error('Failed to refresh vendor data:', result.error);
        errorMessage.value = `Failed to refresh: ${result.error}`;
      }
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error refreshing vendor data:', error);
    errorMessage.value = `Refresh failed: ${error.message}`;
  } finally {
    isRefreshing.value = false;
  }
}

// Load all vending machines from the server
async function loadVendingMachines() {
  try {
    console.log('Loading vending machines...', new Date().toLocaleTimeString());
    isLoading.value = true;
    errorMessage.value = '';
    
    const response = await fetch(`/api/rustplus/vendingMachines?prefix=${encodeURIComponent(shopPrefix.value)}`);
    const result = await response.json();

    console.log(result.data);
    
    if (result.success) {
      // The server now provides pre-structured data
      const { allyShops: allyShopsData, enemyShops: enemyShopsData, undercutListings } = result.data;
      
      // Store shops for reference
      myShops.value = allyShopsData;
      competitorShops.value = enemyShopsData;
      
      // Use undercutListings directly since they're in the right format
      undercutItems.value = undercutListings;
      
      // Reset retry count on success
      retryCount.value = 0;
    } else {
      console.error('Failed to load vending machines:', result.error);
      
      // Handle specific error cases
      if (result.error.includes('Not connected')) {
        errorMessage.value = 'Rust+ not connected. Please wait for connection to establish.';
        console.log('Rust+ not connected, waiting for connection...');
      } else if (result.error.includes('No map markers')) {
        errorMessage.value = 'No map markers available yet. Please wait for data to load.';
        console.log('No map markers available, waiting for data...');
        
        // Show additional details if available
        if (result.details) {
          console.log('Service readiness details:', result.details);
          if (result.details.suggestion) {
            errorMessage.value += ` ${result.details.suggestion}`;
          }
        }
        
        // Try to refresh markers if we have connection
        if (rustplusStatus.value.connected && retryCount.value < maxRetries) {
          retryCount.value++;
          console.log(`Retrying in 5 seconds... (${retryCount.value}/${maxRetries})`);
          setTimeout(() => {
            if (rustplusStatus.value.connected) {
              loadVendingMachines();
            }
          }, 5000);
        }
      } else {
        errorMessage.value = `Error: ${result.error}`;
      }
    }
  } catch (error) {
    console.error('Error loading vending machines:', error);
    if (error.message.includes('Failed to fetch')) {
      errorMessage.value = 'Network error. Server might be unavailable.';
      console.log('Network error, server might be unavailable');
    } else {
      errorMessage.value = `Error: ${error.message}`;
    }
  } finally {
    isLoading.value = false;
  }
}
// Load data on component mount
onMounted(async () => {
  // Initial data load
  if (shopPrefix.value) {
    await loadVendingMachines();
  }
  
  // Set up auto-refresh interval
  const refreshInterval = setInterval(() => {
    if (rustplusStatus.value.connected && shopPrefix.value) {
      console.log('Auto-refreshing vendor data...');
      loadVendingMachines();
    }
  }, 60000); // Refresh every minute
  
  // Clean up interval on component unmount
  onBeforeUnmount(() => {
    clearInterval(refreshInterval);
  });
});

// Handle image loading errors
function handleImageError(event) {
  if (event && event.target) {
    // Hide the image and show an icon instead
    event.target.style.display = 'none';
    // The v-icon fallback will show automatically
  }
}

// Helper function to calculate trade ratio
function calculateRatio(price, quantity) {
  if (!quantity || quantity === 0) return '?';
  // Return ratio showing items per currency unit (e.g., 100 wood for 1000 metal = 0.1 wood per metal)
  // For display, show as "0.10:1" meaning 0.10 wood per 1 metal frag
  const ratio = quantity / price;
  return ratio.toFixed(2);
}

// Helper function to get quantity from order
function getQuantityFromOrder(order) {
  return order?.quantity || 1;
}

// Helper function to get the lowest competitor price
function getLowestEnemyPrice(listing) {
  if (!listing.enemyShops || listing.enemyShops.length === 0) return 0;
  return Math.min(...listing.enemyShops.map(e => e.price));
}
</script>