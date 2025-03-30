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
        <v-card v-for="item in undercutItems" :key="`${item.itemId}-${item.myShop.id}`" class="mb-5" theme="dark">
          <v-card-title class="text-primary">{{ item.myShop.name }}</v-card-title>

          <div class="pa-2">
            <v-table density="compact">
              <thead>
                <tr>
                  <th class="text-left">Type</th>
                  <th class="text-left">Trade</th>
                  <th class="text-right">Ratio</th>
                </tr>
              </thead>
              <tbody>
                <!-- Your price row -->
                <tr>
                  <td>Your price</td>
                  <td>
                    <div class="d-flex align-center">
                      <v-img :src="item.itemImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ getQuantityFromOrder(item.myOrder) }}
                      <v-icon class="mx-2">mdi-arrow-right</v-icon>
                      <v-img :src="item.currencyImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ item.yourPrice }}
                    </div>
                  </td>
                  <td class="text-right font-weight-bold">{{ calculateRatio(item.yourPrice, getQuantityFromOrder(item.myOrder)) }}:1</td>
                </tr>
                
                <!-- Competitor rows -->
                <tr v-for="competitor in item.competitors" :key="competitor.shopId">
                  <td class="text-purple-lighten-3">{{ competitor.shopName }}</td>
                  <td>
                    <div class="d-flex align-center">
                      <v-img :src="item.itemImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ competitor.quantity || 1 }}
                      <v-icon class="mx-2">mdi-arrow-right</v-icon>
                      <v-img :src="item.currencyImage" @error="handleImageError" contain width="24" height="24" class="mr-1"></v-img>
                      ×{{ competitor.price }}
                    </div>
                  </td>
                  <td class="text-right font-weight-bold">{{ calculateRatio(competitor.price, competitor.quantity || 1) }}:1</td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Suggestion -->
          <v-card-text class="text-center text-cyan-accent-2">
            Change your cost to {{ getLowestCompetitorPrice(item) - 1 }} {{ item.currencyName }} or less.
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';
import axios from 'axios';

// State variables
const shopPrefix = ref(localStorage.getItem('shopPrefix') || '');
const isLoading = ref(true);
const allVendingMachines = ref([]);
const undercutItems = ref([]);
const rustplusStatus = ref({ connected: false });
const rustItemsCache = ref({});

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
      // Update state with the data from the server
      allVendingMachines.value = result.data.allShops;
      console.log(`Loaded ${allVendingMachines.value.length} total shops`);
      
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
  try {
    console.log('Finding undercut items from enriched data...');
    
    // Reset any previous results
    undercutItems.value = [];
    
    // First, extract all the items you are selling
    const mySellingItems = [];
    
    myShops.value.forEach(shop => {
      if (!shop.sellOrders) return;
      
      shop.sellOrders.forEach(myOrder => {
        // Debug
        console.log('Processing my order:', myOrder);
        
        // Use the new data structure
        const itemId = myOrder.itemId;
        const currencyId = myOrder.currencyId;
        const pricePerItem = myOrder.costPerItem;
        
        mySellingItems.push({
          itemId: itemId,
          itemName: myOrder.itemDetails?.name || `Unknown Item (${itemId})`,
          itemImage: myOrder.itemDetails?.image || '/img/items/unknown.png',
          currencyId: currencyId,
          currencyDetails: rustItemsCache.value[currencyId] || null,
          currencyName: getCurrencyName(currencyId),
          currencyImage: rustItemsCache.value[currencyId]?.image || '/img/items/unknown.png',
          myPrice: pricePerItem,
          myShopName: shop.name,
          myShopId: shop.id,
          quantity: myOrder.quantity,
          myOrder: myOrder
        });
      });
    });
    
    console.log('My selling items:', mySellingItems);
    
    // Now check each of your items against competitor shops
    mySellingItems.forEach(myItem => {
      // Find all competing offers for this item
      const competingOffers = [];
      
      competitorShops.value.forEach(shop => {
        if (!shop.sellOrders) return;
        
        shop.sellOrders.forEach(theirOrder => {
          // Skip if this isn't the same item
          if (theirOrder.itemId !== myItem.itemId) return;
          // Skip if they're not selling for the same currency
          if (theirOrder.currencyId !== myItem.currencyId) return;
          
          competingOffers.push({
            shopName: shop.name,
            shopId: shop.id,
            price: theirOrder.costPerItem,
            quantity: theirOrder.quantity,
            order: theirOrder
          });
        });
      });
      
      // Now check if any competing offers have lower prices
      if (competingOffers.length > 0) {
        console.log(`Found ${competingOffers.length} competing offers for ${myItem.itemName}`);
        
        // Sort competing offers by price (lowest first)
        const sortedOffers = [...competingOffers].sort((a, b) => a.price - b.price);
        
        // Filter only the offers that are lower than your price
        const undercuttingOffers = sortedOffers.filter(offer => offer.price < myItem.myPrice);
        
        // If any offers are undercutting you
        if (undercuttingOffers.length > 0) {
          const lowestOffer = undercuttingOffers[0]; // For calculating difference
          const priceDiff = myItem.myPrice - lowestOffer.price;
          const percentDiff = (priceDiff / myItem.myPrice) * 100;
          
          undercutItems.value.push({
            itemId: myItem.itemId,
            itemName: myItem.itemName,
            itemImage: myItem.itemImage,
            yourPrice: myItem.myPrice,
            // Instead of a single competitor, add all undercutting competitors
            competitors: undercuttingOffers.map(offer => ({
              shopId: offer.shopId,
              shopName: offer.shopName,
              price: offer.price,
              quantity: offer.quantity
            })),
            priceDifference: priceDiff,
            undercutPercent: percentDiff,
            percentageDifference: percentDiff,  // For compatibility with template
            myShop: {
              id: myItem.myShopId,
              name: myItem.myShopName
            },
            myOrder: myItem.myOrder,
          });
          
          console.log(`Item ${myItem.itemName} is being undercut! Your price: ${myItem.myPrice}, Their price: ${lowestOffer.price}`);
        }
      }
    });
    
    // Sort the results so that the most important undercutting is shown first
    undercutItems.value.sort((a, b) => {
      // First sort by undercut percentage (biggest undercutting first)
      return b.undercutPercent - a.undercutPercent;
    });
    
    console.log(`Found ${undercutItems.value.length} items being undercut`);
  } catch (error) {
    console.error('Error finding undercut items:', error);
  }
}

// Helper function to get currency name from ID
function getCurrencyName(currencyId) {
  const itemDetails = rustItemsCache.value[currencyId];
  if (itemDetails) return itemDetails.name;
  
  return `Unknown Currency (${currencyId})`;
}

// Add a function to load all items from the database
async function loadItemDatabase() {
  try {
    const response = await axios.get('/api/items?all=true');
    if (response.data.success && response.data.data.items) {
      // Convert from object to lookup
      const items = response.data.data.items;
      for (const id in items) {
        rustItemsCache.value[id] = items[id];
      }
      console.log(`Loaded ${Object.keys(rustItemsCache.value).length} items from database`);
    }
  } catch (error) {
    console.error('Failed to load item database:', error);
  }
}

// Load data on component mount
onMounted(async () => {
  // Add this call
  await loadItemDatabase();
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
function getLowestCompetitorPrice(item) {
  if (!item.competitors || item.competitors.length === 0) return 0;
  return Math.min(...item.competitors.map(c => c.price));
}
</script>

<!-- No custom CSS needed, using Vuetify's built-in classes -->