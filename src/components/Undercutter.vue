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
        <h3>Items Being Undercut</h3>
        <v-card v-for="item in undercutItems" :key="`${item.itemId}-${item.myShop.id}`" class="mb-4">
          <v-card-text>
            <v-row>
              <v-col cols="12" sm="2">
                <v-img 
                  :src="item.itemImage || '/img/items/unknown.png'" 
                  :alt="item.itemName"
                  @error="$event.target.src = '/img/items/unknown.png'"
                  contain
                  height="64"
                ></v-img>
              </v-col>
              <v-col cols="12" sm="10">
                <h4>{{ item.itemName || 'Unknown Item' }}</h4>
                <p>Your Price: {{ item.yourPrice }}</p>
                <p>Competitor Price: {{ item.competitorPrice }}</p>
                <p>Difference: {{ item.priceDifference }} ({{ Math.round(item.percentageDifference) }}%)</p>
                <p>Your Shop: {{ item.myShop.name }}</p>
                <p>Competitor Shop: {{ item.competitorShop.name }}</p>
              </v-col>
            </v-row>
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
const allVendingMachines = ref([]);
const undercutItems = ref([]);
const rustplusStatus = ref({ connected: false });

// Create computed properties for filtering shops
const myShops = computed(() => {
  return allVendingMachines.value.filter(machine => 
    machine.name && 
    machine.name.toLowerCase().includes(shopPrefix.value.toLowerCase())
  );
});

const competitorShops = computed(() => {
  return allVendingMachines.value.filter(machine => 
    machine.name && 
    !machine.name.toLowerCase().includes(shopPrefix.value.toLowerCase())
  );
});

// Setup socket connection
const socket = io(import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

// Initialize rustplus status
socket.on('connect', () => {
  console.log('Socket connected');
  // Request current status
  socket.emit('getStatus');
  console.log('Requested Rust+ status');
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
  rustplusStatus.value = { connected: false };
});

// Listen for connection status updates
socket.on('rustplusStatus', (status) => {
  rustplusStatus.value = status;
  console.log('Received Rust+ status update:', status);
  
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
    console.log('Vending machines API response:', result);
    
    if (result.success) {
      // The data now comes pre-split from the server
      const { yourShops, competitorShops, allShops } = result.data;
      
      // Update state
      allVendingMachines.value = allShops;
      console.log(`Loaded ${allShops.length} total shops`);
      
      // Find items being undercut - this can now be simplified
      findUndercutItemsFromEnrichedData();
    } else {
      console.error('Failed to load vending machines:', result.error);
    }
  } catch (error) {
    console.error('Error loading vending machines:', error);
  } finally {
    isLoading.value = false;
  }
}

// Updated function to find undercut items from pre-enriched data
function findUndercutItemsFromEnrichedData() {
  undercutItems.value = [];
  
  // No processing needed if no shops found
  if (myShops.value.length === 0 || competitorShops.value.length === 0) {
    return;
  }
  
  // For each of your shops
  myShops.value.forEach(myShop => {
    // For each item you're selling
    if (myShop.sellOrders && myShop.sellOrders.length > 0) {
      myShop.sellOrders.forEach(myOrder => {
        // The data is now enriched, so we can use direct properties
        const myItemId = myOrder.sellingItem.id;
        const myPrice = myOrder.currencyItem.amount;
        
        // Find the same item in competitor shops
        let lowestCompetitorPrice = Infinity;
        let competitorShopWithLowestPrice = null;
        let competitorOrder = null;
        
        competitorShops.value.forEach(competitorShop => {
          if (competitorShop.sellOrders) {
            competitorShop.sellOrders.forEach(order => {
              // If selling the same item
              if (order.sellingItem.id === myItemId && order.currencyItem.amount < lowestCompetitorPrice) {
                lowestCompetitorPrice = order.currencyItem.amount;
                competitorShopWithLowestPrice = competitorShop;
                competitorOrder = order;
              }
            });
          }
        });
        
        // If found a competitor selling for less
        if (competitorShopWithLowestPrice && lowestCompetitorPrice < myPrice) {
          const priceDifference = myPrice - lowestCompetitorPrice;
          const percentageDifference = (priceDifference / myPrice) * 100;
          
          undercutItems.value.push({
            itemId: myItemId,
            itemName: myOrder.sellingItem.name,
            itemImage: myOrder.sellingItem.imageUrl,
            yourPrice: myPrice,
            competitorPrice: lowestCompetitorPrice,
            priceDifference: priceDifference,
            percentageDifference: percentageDifference,
            myShop: myShop,
            competitorShop: competitorShopWithLowestPrice,
            competitorOrder: competitorOrder,
            suggestedPrice: Math.max(1, lowestCompetitorPrice - 1)
          });
        }
      });
    }
  });
  
  // Sort by percentage difference (highest first)
  undercutItems.value.sort((a, b) => b.percentageDifference - a.percentageDifference);
}

// Load data on component mount
onMounted(async () => {
  // Then load vending machines
  loadVendingMachines();
  
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
</script>