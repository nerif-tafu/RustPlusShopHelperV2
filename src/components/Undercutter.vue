<template>
  <v-container>
    <!-- Header with shop prefix input -->
    <v-row>
      <v-col>
        <h2>Price Undercutter</h2>
        <v-row align="center">
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="shopPrefix"
              label="Your Shop Prefix"
              placeholder="Enter your shop name prefix..."
              hide-details
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="4">
            <v-btn @click="saveShopPrefix" color="primary">Save & Refresh</v-btn>
          </v-col>
        </v-row>
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
        <v-card v-for="listing in undercutItems" :key="`${listing.allySellOrder.itemSellingId}-${listing.allySellOrder.shopId}`" class="mb-5" theme="dark">
          <v-card-title class="text-primary">{{ listing.allySellOrder.shopName }}</v-card-title>

          <div class="pa-2">
            <v-table class="w-100" hover>
              <thead>
                <tr>
                  <th class="text-left">Shop</th>
                  <th class="text-left">Trade Details</th>
                  <th class="text-right">Ratio</th>
                </tr>
              </thead>
              <tbody>
                <!-- Your price row -->
                <tr>
                  <td>Your shop</td>
                  <td>
                    <div class="d-flex align-center">
                      <v-img :src="listing.allySellOrder.itemSellingImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ listing.allySellOrder.itemSellingStockQty }}
                      <v-icon class="mx-2">mdi-arrow-right</v-icon>
                      <v-img :src="listing.allySellOrder.itemBuyingImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ listing.allySellOrder.itemBuyingPrice }}
                    </div>
                  </td>
                  <td class="text-right font-weight-bold">{{ calculateRatio(listing.allySellOrder.itemBuyingPrice, listing.allySellOrder.itemSellingStockQty) }}:1</td>
                </tr>
                
                <!-- Competitor rows -->
                <tr v-for="enemy in listing.enemySellOrders" :key="enemy.shopId">
                  <td class="text-purple-lighten-3">{{ enemy.shopName }}</td>
                  <td>
                    <div class="d-flex align-center">
                      <v-img :src="enemy.itemSellingImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ enemy.itemSellingStockQty || 1 }}
                      <v-icon class="mx-2">mdi-arrow-right</v-icon>
                      <v-img :src="enemy.itemBuyingImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ enemy.itemBuyingPrice }}
                    </div>
                  </td>
                  <td class="text-right font-weight-bold">{{ calculateRatio(enemy.itemBuyingPrice, enemy.itemSellingStockQty || 1) }}:1</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Suggestion -->
          <v-card-text class="text-center text-cyan-accent-2">
            Change your cost to {{ getLowestEnemyPrice(listing) - 1 }} {{ listing.allySellOrder.itemBuyingName }} or less.
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

// Load all vending machines from the server
async function loadVendingMachines() {
  try {
    isLoading.value = true;
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
    } else {
      console.error('Failed to load vending machines:', result.error);
    }
  } catch (error) {
    console.error('Error loading vending machines:', error);
  } finally {
    isLoading.value = false;
  }
}
// Load data on component mount
onMounted(async () => {
  
  // Set up refreshing
  const refreshInterval = setInterval(() => {
    if (rustplusStatus.value.connected) {
      loadVendingMachines();
    }
  }, 60000); // Refresh every minute
  
  onBeforeUnmount(() => {
    clearInterval(refreshInterval);
  });
});

// Simplify the handleImageError function
function handleImageError(event) {
  if (event && event.target) {
    // Just use a simple fallback
    event.target.src = '/img/items/unknown.png';
  }
}

// Helper function to calculate trade ratio
function calculateRatio(price, quantity) {
  if (!quantity || quantity === 0) return '?';
  // Return ratio rounded to nearest whole number
  return Math.round(price / quantity);
}

// Helper function to get quantity from order
function getQuantityFromOrder(order) {
  return order?.quantity || 1;
}

// Helper function to get the lowest competitor price
function getLowestEnemyPrice(listing) {
  if (!listing.enemySellOrders || listing.enemySellOrders.length === 0) return 0;
  return Math.min(...listing.enemySellOrders.map(e => e.itemBuyingPrice));
}
</script>