<template>
  <div class="undercutter-container">

    <!-- Loading State -->
    <div v-if="isLoading && undercutItems.length === 0 && allItems.length === 0" class="loading-container">
      <div class="loading-content">
        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
        <p class="loading-text">Loading shop data...</p>
      </div>
    </div>

    <!-- Current Undercuts Section -->
    <div v-else class="section-container">
      <h3 class="section-title">Current Undercuts</h3>
      <p class="section-description">Items where competitors are undercutting your prices</p>
      
      <div v-if="undercutItems.length > 0">
        <div v-for="listing in undercutItems" :key="`undercut-${listing.itemId}-${listing.allyShop.shopId}`" class="comparison-card undercut-card">
        <!-- Item header -->
        <div class="item-header">
          <div class="item-info">
            <img v-if="listing.itemImage" :src="listing.itemImage" @error="handleImageError" class="item-icon" />
            <v-icon v-else class="item-icon">mdi-package</v-icon>
            <span class="item-name">{{ listing.itemName }}</span>
          </div>
        </div>

        <!-- Comparison table -->
        <div class="comparison-table">
          <div class="table-header">
            <div class="header-cell">Shop Name</div>
            <div class="header-cell">Sell</div>
            <div class="header-cell">For</div>
            <div class="header-cell">Ratio</div>
          </div>

          <!-- Your price row -->
          <div class="table-row your-price">
            <div class="cell shop-name" @click="openMap({ shopName: listing.allyShop.shopName, x: allyShopX(listing), y: allyShopY(listing) })">{{ listing.allyShop.shopName }}</div>
            <div class="cell sell-display">
              <div class="item-stack">
                <img v-if="listing.itemImage" :src="listing.itemImage" @error="handleImageError" class="stack-icon" />
                <v-icon v-else class="stack-icon">mdi-package</v-icon>
                <span class="stack-amount">×{{ listing.allyShop.quantity }}</span>
              </div>
            </div>
            <div class="cell for-display">
              <div class="currency-stack">
                <img v-if="getCurrencyImage(listing.allyShop.currencyId)" :src="getCurrencyImage(listing.allyShop.currencyId)" @error="handleImageError" class="stack-icon" />
                <v-icon v-else class="stack-icon">mdi-currency-usd</v-icon>
                <span class="stack-amount">×{{ listing.allyShop.price }}</span>
              </div>
            </div>
            <div class="cell ratio">1:{{ calculateRatio(listing.allyShop.price, listing.allyShop.quantity) }}</div>
          </div>

          <!-- Competitor rows -->
          <div v-for="enemy in listing.enemyShops" :key="enemy.shopId" 
               :class="['table-row', 'competitor-price', { 'not-undercutting': !enemy.isUndercutting }]">
            <div class="cell shop-name" @click="openMap({ shopName: enemy.shopName, x: enemyShopX(enemy), y: enemyShopY(enemy) })">{{ enemy.shopName }}</div>
            <div class="cell sell-display">
              <div class="item-stack">
                <img v-if="listing.itemImage" :src="listing.itemImage" @error="handleImageError" class="stack-icon" />
                <v-icon v-else class="stack-icon">mdi-package</v-icon>
                <span class="stack-amount">×{{ enemy.quantity || 1 }}</span>
              </div>
            </div>
            <div class="cell for-display">
              <div class="currency-stack">
                <img v-if="getCurrencyImage(enemy.currencyId)" :src="getCurrencyImage(enemy.currencyId)" @error="handleImageError" class="stack-icon" />
                <v-icon v-else class="stack-icon">mdi-currency-usd</v-icon>
                <span class="stack-amount">×{{ enemy.price }}</span>
              </div>
            </div>
            <div class="cell ratio">1:{{ calculateRatio(enemy.price, enemy.quantity || 1) }}</div>
          </div>
        </div>

        <!-- Recommendation -->
        <div class="recommendation">
          <span class="recommendation-text">Change your cost to {{ getCompetitivePrice(listing) }} {{ getCurrencyNameSync(listing.allyShop.currencyId) }} or less.</span>
        </div>
        </div>
      </div>
      
      <!-- No undercuts placeholder -->
      <div v-else class="placeholder-box">
        <v-alert type="success">
          <h3>No Undercuts Found</h3>
          <p>Great news! None of your items are being undercut by competitors.</p>
        </v-alert>
      </div>
    </div>

    <!-- All Your Items Section -->
    <div v-if="!isLoading || (undercutItems.length > 0 || allItems.length > 0)" class="section-container">
      <h3 class="section-title">All Your Items</h3>
      <p class="section-description">All items you're selling with competitor price comparisons</p>
      
      <div v-if="allItems.length > 0">
        <div v-for="item in allItems" :key="`all-${item.itemId}-${item.allyShop.shopId}`" class="comparison-card all-items-card">
        <!-- Item header -->
        <div class="item-header">
          <div class="item-info">
            <img v-if="item.itemImage" :src="item.itemImage" @error="handleImageError" class="item-icon" />
            <v-icon v-else class="item-icon">mdi-package</v-icon>
            <span class="item-name">{{ item.itemName }}</span>
          </div>
        </div>

        <!-- Comparison table -->
        <div class="comparison-table">
          <div class="table-header">
            <div class="header-cell">Shop Name</div>
            <div class="header-cell">Sell</div>
            <div class="header-cell">For</div>
            <div class="header-cell">Ratio</div>
          </div>

          <!-- Your price row -->
          <div class="table-row your-price">
            <div class="cell shop-name">{{ item.allyShop.shopName }}</div>
            <div class="cell sell-display">
              <div class="item-stack">
                <img v-if="getItemImage(item)" :src="getItemImage(item)" @error="handleImageError" class="stack-icon" />
                <v-icon v-else class="stack-icon">mdi-package</v-icon>
                <span class="stack-amount">×{{ item.allyShop.quantity }}</span>
              </div>
            </div>
            <div class="cell for-display">
              <div class="currency-stack">
                <img v-if="getCurrencyImage(item.allyShop.currencyId)" :src="getCurrencyImage(item.allyShop.currencyId)" @error="handleImageError" class="stack-icon" />
                <v-icon v-else class="stack-icon">mdi-currency-usd</v-icon>
                <span class="stack-amount">×{{ item.allyShop.price }}</span>
              </div>
            </div>
            <div class="cell ratio">1:{{ calculateRatio(item.allyShop.price, item.allyShop.quantity) }}</div>
          </div>

          <!-- Competitor rows (if any) -->
          <div v-if="item.enemyShops && item.enemyShops.length > 0">
            <div v-for="enemy in item.enemyShops" :key="enemy.shopId" class="table-row competitor-price">
              <div class="cell shop-name" @click="openMap({ shopName: enemy.shopName, x: enemy.x, y: enemy.y })">{{ enemy.shopName }}</div>
              <div class="cell sell-display">
                <div class="item-stack">
                  <img v-if="getItemImage(item)" :src="getItemImage(item)" @error="handleImageError" class="stack-icon" />
                  <v-icon v-else class="stack-icon">mdi-package</v-icon>
                  <span class="stack-amount">×{{ enemy.quantity || 1 }}</span>
                </div>
              </div>
              <div class="cell for-display">
                <div class="currency-stack">
                  <img v-if="getCurrencyImage(enemy.currencyId)" :src="getCurrencyImage(enemy.currencyId)" @error="handleImageError" class="stack-icon" />
                  <v-icon v-else class="stack-icon">mdi-currency-usd</v-icon>
                  <span class="stack-amount">×{{ enemy.price }}</span>
                </div>
              </div>
              <div class="cell ratio">1:{{ calculateRatio(enemy.price, enemy.quantity || 1) }}</div>
            </div>
          </div>

          <!-- No competitors message -->
          <div v-else class="no-competitors">
            <div class="table-row no-competitors-row">
              <div class="cell shop-name">No competitors found</div>
              <div class="cell sell-display">-</div>
              <div class="cell for-display">-</div>
              <div class="cell ratio">-</div>
            </div>
          </div>
        </div>
        </div>
      </div>
      
      <!-- No items placeholder -->
      <div v-else class="placeholder-box">
        <v-alert type="info">
          <h3>No Items Found</h3>
          <p>No vending machines matching your shop prefix were found.</p>
          <p>Please configure your shop prefix in the Settings page.</p>
        </v-alert>
      </div>
    </div>


    <!-- Sticky Status Bar -->
    <div class="sticky-status-bar">
      <div class="status-content">
        <div class="status-left">
          <span v-if="lastUpdated" class="last-updated">
            Last updated: {{ formatTime(lastUpdated) }}
          </span>
          <span v-else class="no-data">No data loaded</span>
        </div>
        <div class="status-right">
          <v-btn 
            @click="refreshAllData" 
            :loading="isLoading"
            color="primary" 
            size="small"
            class="refresh-btn"
          >
            <v-icon left>mdi-refresh</v-icon>
            Refresh Data
          </v-btn>
        </div>
      </div>
                    </div>
          </div>
  <MapModal v-model:visible="mapVisible" :shop="mapShop" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import MapModal from './MapModal.vue';
import { io } from 'socket.io-client';
import itemDatabaseService from '../services/itemDatabaseService.js';

// State variables
const undercutItems = ref([]);
const myShops = ref([]);
const competitorShops = ref([]);
const allItems = ref([]); // New state variable to hold all item listings
const isLoading = ref(false);
const lastUpdated = ref(null);
const currencyCache = ref({}); // Cache for currency names

// Map modal state
const mapVisible = ref(false);
const mapShop = ref(null);
const openMap = (shop) => { mapShop.value = shop; mapVisible.value = true; };

// Helpers to fetch ally shop coords from listing
const allyShopX = (listing) => {
  const shop = myShops.value.find(s => s.entid === listing.allyShop.shopId || s.shopName === listing.allyShop.shopName);
  return shop ? shop.x : 0;
};
const allyShopY = (listing) => {
  const shop = myShops.value.find(s => s.entid === listing.allyShop.shopId || s.shopName === listing.allyShop.shopName);
  return shop ? shop.y : 0;
};

// Resolve enemy shop coords
const enemyShopX = (enemy) => {
  const shop = competitorShops.value.find(s => s.entid === enemy.shopId || s.shopName === enemy.shopName);
  return shop ? shop.x : 0;
};
const enemyShopY = (enemy) => {
  const shop = competitorShops.value.find(s => s.entid === enemy.shopId || s.shopName === enemy.shopName);
  return shop ? shop.y : 0;
};

// Setup socket connection
const socket = io(import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

// Load data on component mount
onMounted(async () => {
  // Load vending machines data
  await loadVendingMachines();
  
  // Set up socket event listeners for real-time updates
  socket.on('vendingMachinesUpdated', (data) => {
    console.log('Received vending machines update:', data);
    loadVendingMachines();
  });
  
  socket.on('rustplusStatusChanged', (status) => {
    console.log('Rust+ status changed:', status);
    // Reload data when Rust+ connection status changes
  if (status.connected) {
    loadVendingMachines();
  }
});

  // Set up auto-refresh interval (more frequent for better responsiveness)
  const refreshInterval = setInterval(() => {
    console.log('Auto-refreshing vending machines data...');
  loadVendingMachines();
  }, 30000); // Refresh every 30 seconds instead of 60
  
  // Clean up interval and socket listeners on component unmount
  onBeforeUnmount(() => {
    clearInterval(refreshInterval);
    socket.off('vendingMachinesUpdated');
    socket.off('rustplusStatusChanged');
  });
});

// Refresh all data (map + vending machines)
async function refreshAllData() {
  try {
    isLoading.value = true;
    console.log('Refreshing all data...');
    
    // First, trigger a map data refresh from Rust+
    try {
      console.log('Requesting map data refresh from Rust+ API...');
      const mapResponse = await fetch('/api/rustplus/refresh-markers', {
      method: 'POST'
    });
      const mapResult = await mapResponse.json();
      
      if (mapResult.success) {
        console.log('Map data refresh triggered successfully at', new Date().toLocaleTimeString());
        console.log('Refresh response:', mapResult);
      } else {
        console.warn('Map data refresh failed:', mapResult.error);
      }
    } catch (error) {
      console.warn('Error triggering map refresh:', error);
    }
    
    // Wait a moment for map data to update, then refresh vending machines
    console.log('Waiting for map data to update...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Increased wait time
    
    // Now refresh vending machine data
    console.log('Loading vending machines data after map refresh...');
    await loadVendingMachines();
    
  } catch (error) {
    console.error('Error refreshing all data:', error);
  } finally {
    isLoading.value = false;
  }
}

// Load all vending machines from the server
async function loadVendingMachines() {
  try {
    // Only set loading if not already loading (to avoid conflicts with refreshAllData)
    if (!isLoading.value) {
    isLoading.value = true;
    }
    
    // Get shop prefix from localStorage
    const shopPrefix = localStorage.getItem('shopPrefix');
    
    if (!shopPrefix) {
      console.log('No shop prefix configured');
      isLoading.value = false;
      return;
    }
    
    const response = await fetch(`/api/rustplus/vendingMachines?prefix=${encodeURIComponent(shopPrefix)}`);
    const result = await response.json();
    
    if (result.success) {
      // The server provides pre-structured data
      const { allyShops: allyShopsData, enemyShops: enemyShopsData, undercutListings } = result.data;
      
      // Debug the data structure
      console.log('Raw server response:', result.data);
      console.log('Ally shops structure:', allyShopsData);
      console.log('Enemy shops structure:', enemyShopsData);
      
      // Debug specific shop data
      const aSho2 = enemyShopsData.find(shop => shop.shopName && shop.shopName.includes('A Sho 2'));
      if (aSho2) {
        console.log('A Sho 2 shop data:', aSho2);
        if (aSho2.shopContents) {
          console.log('A Sho 2 shop contents:', aSho2.shopContents);
          // Log each item in shopContents with full details
          aSho2.shopContents.forEach((item, index) => {
            console.log(`A Sho 2 item ${index} at ${new Date().toLocaleTimeString()}:`, {
              itemId: item.itemId,
              quantity: item.quantity,
              costPerItem: item.costPerItem,
              currencyId: item.currencyId,
              fullItem: item
            });
          });
        }
      } else {
        console.log('A Sho 2 not found in enemy shops data');
      }
      
      // Store shops for reference
      myShops.value = allyShopsData;
      competitorShops.value = enemyShopsData;
      
      // Process undercut listings to include all competitors for each undercut item
      undercutItems.value = [];
      
      for (const undercut of undercutListings) {
        // Find all competitors selling the same item+currency combo
        const allCompetitors = [];
        
        enemyShopsData.forEach(enemyShop => {
          if (enemyShop.shopContents && Array.isArray(enemyShop.shopContents)) {
            enemyShop.shopContents.forEach(enemyItem => {
              if (enemyItem.itemId === undercut.itemId && enemyItem.currencyId === undercut.allyShop.currencyId) {
                // Only consider competitors that have meaningful stock (amountInStock > 1)
                // Use amountInStock instead of quantity - quantity is per transaction, amountInStock is actual stock
                const enemyStock = enemyItem.amountInStock || 0;
                const hasMeaningfulStock = enemyStock > 1;
                console.log(`Checking competitor ${enemyShop.shopName} for item ${enemyItem.itemId}:`, {
                  quantity: enemyItem.quantity,
                  amountInStock: enemyStock,
                  costPerItem: enemyItem.costPerItem,
                  hasStock: hasMeaningfulStock,
                  reason: enemyStock <= 1 ? 'Low stock (≤1)' : 'Sufficient stock'
                });
                
                if (hasMeaningfulStock) {
                  // Calculate if this competitor is actually undercutting
                  const yourPricePerUnit = undercut.allyShop.price / undercut.allyShop.quantity;
                  const enemyPricePerUnit = enemyItem.costPerItem / enemyItem.quantity;
                  const isUndercutting = enemyPricePerUnit <= yourPricePerUnit;
                  
                  allCompetitors.push({
                    ...enemyShop,
                    price: enemyItem.costPerItem,
                    quantity: enemyItem.quantity,
                    currencyId: enemyItem.currencyId,
                    isUndercutting: isUndercutting,
                    pricePerUnit: enemyPricePerUnit
                  });
    } else {
                  console.log(`Excluding ${enemyShop.shopName} - insufficient stock (amountInStock: ${enemyStock})`);
                }
              }
            });
          }
        });
        
        // Sort competitors by cheapest price per unit (lowest price first)
        allCompetitors.sort((a, b) => {
          // Handle N/A values by putting them at the end
          if (a.pricePerUnit === undefined && b.pricePerUnit === undefined) return 0;
          if (a.pricePerUnit === undefined) return 1;
          if (b.pricePerUnit === undefined) return -1;
          
          // Sort by price per unit ascending (cheapest first)
          return a.pricePerUnit - b.pricePerUnit;
        });
        
        // Create the undercut item with all competitors
        const undercutItem = {
          ...undercut,
          enemyShops: allCompetitors
        };
        
        undercutItems.value.push(undercutItem);
      }
      
      // Debug: Log undercut items to see why they're being flagged
      console.log('Undercut items from server:', undercutListings);
      undercutListings.forEach(item => {
        console.log(`Item ${item.itemName} flagged as undercut:`, {
          yourPrice: item.allyShop.price,
          yourQuantity: item.allyShop.quantity,
          yourPricePerUnit: item.allyShop.price / item.allyShop.quantity,
          enemyShops: item.enemyShops.map(e => ({
            shopName: e.shopName,
            price: e.price,
            quantity: e.quantity,
            pricePerUnit: e.price / e.quantity
          }))
        });
      });
      
      // Cache currency names for undercut items
      for (const undercut of undercutListings) {
        if (undercut.allyShop && undercut.allyShop.currencyId && !currencyCache.value[undercut.allyShop.currencyId]) {
          try {
            const currencyDetails = await itemDatabaseService.getItemById(undercut.allyShop.currencyId);
            if (currencyDetails) {
              currencyCache.value[undercut.allyShop.currencyId] = currencyDetails.name;
            }
          } catch (error) {
            console.log('Could not get currency details for undercut item ID:', undercut.allyShop.currencyId);
          }
        }
      }
      
      // Create allItems by combining ally shops with their enemy shops
      allItems.value = [];
      
      // Process each ally shop and its contents
      for (const allyShop of allyShopsData) {
        // Each shop can have multiple items in shopContents
        for (const shopItem of allyShop.shopContents) {
          // Find enemy shops that sell the same item
          let itemEnemyShops = [];
          
          // Check if enemy shops have shopContents structure
          if (enemyShopsData && enemyShopsData.length > 0) {
            enemyShopsData.forEach(enemyShop => {
              // If enemy shop has shopContents, check each item
              if (enemyShop.shopContents && Array.isArray(enemyShop.shopContents)) {
                enemyShop.shopContents.forEach(enemyItem => {
                  // Only match if both item AND currency are the same
                  if (enemyItem.itemId === shopItem.itemId && enemyItem.currencyId === shopItem.currencyId) {
                    // Only consider competitors that have meaningful stock (amountInStock > 1)
                    const enemyStock = enemyItem.amountInStock || 0;
                    const hasMeaningfulStock = enemyStock > 1;
                    console.log(`All Items - Checking competitor ${enemyShop.shopName} for item ${enemyItem.itemId}:`, {
                      quantity: enemyItem.quantity,
                      amountInStock: enemyStock,
                      costPerItem: enemyItem.costPerItem,
                      hasStock: hasMeaningfulStock,
                      reason: enemyStock <= 1 ? 'Low stock (≤1)' : 'Sufficient stock'
                    });
                    
                    if (hasMeaningfulStock) {
                      // Calculate if this competitor is actually undercutting
                      const yourPricePerUnit = shopItem.costPerItem / (shopItem.quantity || 1);
                      const enemyPricePerUnit = enemyItem.costPerItem / enemyItem.quantity;
                      const isUndercutting = enemyPricePerUnit <= yourPricePerUnit;
                      
                      itemEnemyShops.push({
                        ...enemyShop,
                        price: enemyItem.costPerItem,
                        quantity: enemyItem.quantity,
                        currencyId: enemyItem.currencyId,
                        isUndercutting: isUndercutting,
                        pricePerUnit: enemyPricePerUnit
                      });
                    } else {
                      console.log(`All Items - Excluding ${enemyShop.shopName} - insufficient stock (amountInStock: ${enemyStock})`);
                    }
                  }
                });
              } else if (enemyShop.itemId === shopItem.itemId && enemyShop.currencyId === shopItem.currencyId) {
                // Direct itemId match (old structure) - also check currency
                const enemyStock = enemyShop.amountInStock || 0;
                const hasMeaningfulStock = enemyStock > 1;
                console.log(`All Items (Old Structure) - Checking competitor ${enemyShop.shopName} for item ${enemyShop.itemId}:`, {
                  quantity: enemyShop.quantity,
                  amountInStock: enemyStock,
                  price: enemyShop.price,
                  hasStock: hasMeaningfulStock,
                  reason: enemyStock <= 1 ? 'Low stock (≤1)' : 'Sufficient stock'
                });
                
                if (hasMeaningfulStock) {
                  const yourPricePerUnit = shopItem.costPerItem / (shopItem.quantity || 1);
                  const enemyPricePerUnit = enemyShop.price / enemyShop.quantity;
                  const isUndercutting = enemyPricePerUnit <= yourPricePerUnit;
                  
                  itemEnemyShops.push({
                    ...enemyShop,
                    isUndercutting: isUndercutting,
                    pricePerUnit: enemyPricePerUnit
                  });
                } else {
                  console.log(`All Items (Old Structure) - Excluding ${enemyShop.shopName} - insufficient stock (amountInStock: ${enemyStock})`);
                }
              }
            });
          }
          
          // Debug competitor matching
          console.log(`Looking for competitors for item ${shopItem.itemId} with currency ${shopItem.currencyId}:`);
          console.log('Your item details:', {
            itemId: shopItem.itemId,
            currencyId: shopItem.currencyId,
            price: shopItem.costPerItem,
            quantity: shopItem.quantity
          });
          console.log('Available enemy shops:', enemyShopsData.map(e => ({ 
            shopName: e.shopName, 
            hasShopContents: !!e.shopContents,
            itemCount: e.shopContents ? e.shopContents.length : 0
          })));
          console.log('Matched competitors (same item + currency):', itemEnemyShops);
          if (itemEnemyShops.length > 0) {
            console.log('Competitor details:', itemEnemyShops.map(c => ({
              shopName: c.shopName,
              price: c.price,
              quantity: c.quantity,
              currencyId: c.currencyId
            })));
            
            // Sort competitors by cheapest price per unit (lowest price first)
            itemEnemyShops.sort((a, b) => {
              // Handle N/A values by putting them at the end
              if (a.pricePerUnit === undefined && b.pricePerUnit === undefined) return 0;
              if (a.pricePerUnit === undefined) return 1;
              if (b.pricePerUnit === undefined) return -1;
              
              // Sort by price per unit ascending (cheapest first)
              return a.pricePerUnit - b.pricePerUnit;
            });
            
            console.log('Competitors sorted by best value:', itemEnemyShops.map(c => ({
              shopName: c.shopName,
              price: c.price,
              quantity: c.quantity,
              ratio: calculateRatio(c.price, c.quantity)
            })));
          }
          
          // Get item details from the database
          let itemDetails = null;
          try {
            itemDetails = await itemDatabaseService.getItemById(shopItem.itemId);
          } catch (error) {
            console.log('Could not get item details for ID:', shopItem.itemId);
          }
          
          // Cache currency name for this item
          if (shopItem.currencyId && !currencyCache.value[shopItem.currencyId]) {
            try {
              const currencyDetails = await itemDatabaseService.getItemById(shopItem.currencyId);
              if (currencyDetails) {
                currencyCache.value[shopItem.currencyId] = currencyDetails.name;
              }
            } catch (error) {
              console.log('Could not get currency details for ID:', shopItem.currencyId);
            }
          }
          
          // Debug logging to see what data we have
          console.log('Processing shopItem:', shopItem);
          console.log('Item ID:', shopItem.itemId);
          console.log('Quantity:', shopItem.quantity);
          console.log('Cost per item:', shopItem.costPerItem);
          console.log('Item details from DB:', itemDetails);
          
          // Check if this item is being undercut (at least one competitor is undercutting or matching)
          const isBeingUndercut = itemEnemyShops.some(enemy => enemy.isUndercutting);
          
          // Only add to "All Your Items" if it's NOT being undercut
          if (!isBeingUndercut) {
            // Create item object with proper structure
            const item = {
              itemId: shopItem.itemId,
              itemName: itemDetails ? itemDetails.name : `Item ${shopItem.itemId}`,
              itemImage: itemDetails ? `/api/items/${shopItem.itemId}/image` : null,
              allyShop: {
                ...allyShop,
                price: shopItem.costPerItem,
                quantity: shopItem.quantity,
                currencyId: shopItem.currencyId
              },
              enemyShops: itemEnemyShops
            };
            
            allItems.value.push(item);
          } else {
            console.log(`Item ${shopItem.itemId} from shop ${allyShop.shopName} is being undercut - excluding from "All Your Items"`);
          }
        }
      }
      
      // Update last updated timestamp
      lastUpdated.value = new Date();
      console.log('Vending machines data loaded successfully at:', lastUpdated.value);
      
    } else {
      console.error('Failed to load vending machines:', result.error);
    }
  } catch (error) {
    console.error('Error loading vending machines:', error);
  } finally {
    // Only reset loading if this function set it (not called from refreshAllData)
    if (isLoading.value) {
    isLoading.value = false;
  }
}
}

// Handle image loading errors
function handleImageError(event) {
  if (event && event.target) {
    // Hide the image and show an icon instead
    event.target.style.display = 'none';
    // The v-icon fallback will show automatically
  }
}

// Helper function to get item image with fallback
function getItemImage(item) {
  // Try to get image from the item itself first
  if (item.itemImage && item.itemImage !== '') {
    return item.itemImage;
  }
  
  // Try to get image from allyShop if available
  if (item.allyShop && item.allyShop.itemImage && item.allyShop.itemImage !== '') {
    return item.allyShop.itemImage;
  }
  
  // Return null if no image found
  return null;
}

// Helper function to get currency image
function getCurrencyImage(currencyId) {
  if (currencyId) {
    return `/api/items/${currencyId}/image`;
  }
  return null;
}

// Helper function to get currency name (async)
async function getCurrencyName(currencyId) {
  if (!currencyId) return 'Unknown Currency';
  
  try {
    const currencyDetails = await itemDatabaseService.getItemById(currencyId);
    return currencyDetails ? currencyDetails.name : `Item ${currencyId}`;
  } catch (error) {
    console.log('Could not get currency details for ID:', currencyId);
    return `Item ${currencyId}`;
  }
}

// Helper function to get currency name (sync - uses cache)
function getCurrencyNameSync(currencyId) {
  if (!currencyId) return 'Unknown Currency';
  
  // Return cached name if available
  if (currencyCache.value[currencyId]) {
    return currencyCache.value[currencyId];
  }
  
  // Return fallback if not cached yet
  return `Item ${currencyId}`;
}

// Helper function to calculate trade ratio
function calculateRatio(price, quantity) {
  // Check if both price and quantity are valid numbers
  if (!price || !quantity || isNaN(price) || isNaN(quantity) || price <= 0 || quantity <= 0) {
    return 'N/A';
  }
  
  // Return ratio showing currency units per item (1:XXX format)
  const ratio = price / quantity;
  if (isNaN(ratio) || !isFinite(ratio)) {
    return 'N/A';
  }
  return ratio.toFixed(2);
}

// Helper function to get the price needed to beat competitors
function getCompetitivePrice(listing) {
  if (!listing.enemyShops || listing.enemyShops.length === 0) return 0;
  
  const yourCurrentPrice = listing.allyShop.price;
  
  // Find the best (lowest) price per unit among competitors
  let bestCompetitorPricePerUnit = Infinity;
  
  listing.enemyShops.forEach(enemy => {
    const enemyPricePerUnit = enemy.price / (enemy.quantity || 1);
    if (enemyPricePerUnit < bestCompetitorPricePerUnit) {
      bestCompetitorPricePerUnit = enemyPricePerUnit;
    }
  });
  
  // Calculate what price we need to undercut the best competitor
  // We want to be at least 1 unit cheaper per item
  const yourQuantity = listing.allyShop.quantity;
  const targetPricePerUnit = bestCompetitorPricePerUnit - 1;
  const competitivePrice = Math.floor(targetPricePerUnit * yourQuantity);
  
  // Make sure we're actually undercutting (price should be lower than current)
  // and that we don't go below 1 unit
  return Math.max(1, Math.min(competitivePrice, yourCurrentPrice - 1));
}

// Helper function to format time for display
function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString();
}
</script>

<style scoped>
.undercutter-container {
  padding: 16px;
  padding-bottom: 80px; /* Space for sticky status bar */
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

.header-controls {
  background-color: #1A1D20;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #2C3034;
}

.page-title {
  color: #B1ADB3;
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0;
}

.refresh-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.refresh-btn {
  background-color: #A673B1 !important;
  color: white !important;
}

.last-updated {
  color: #9D7D99;
  font-size: 0.9rem;
}

.section-container {
  margin-top: 24px;
}

.section-title {
  margin-bottom: 10px;
  font-size: 1.3rem;
  text-align: center;
  color: #B1ADB3;
  font-weight: bold;
}

.section-description {
  margin-bottom: 20px;
  text-align: center;
  color: #9D7D99;
  font-size: 0.9rem;
}

.comparison-card {
  background-color: #1F2225;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #2C3034;
  max-width: 100%;
}

.undercut-card {
  background-color: #2C3034;
  border: 1px solid #A673B1;
}

.all-items-card {
  background-color: #1A1D20;
  border: 1px solid #2C3034;
}

.item-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2C3034;
  text-align: center;
}

.item-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.item-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.item-name {
  font-size: 1.1rem;
  font-weight: 500;
  color: #B1ADB3;
}

.comparison-table {
  margin-bottom: 16px;
}

.table-header {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1.5fr 1fr;
  gap: 12px;
  padding: 8px 12px;
  background-color: #231E29;
  border-radius: 4px;
  margin-bottom: 8px;
  font-weight: 500;
  color: #B1ADB3;
  font-size: 0.9rem;
}

.header-cell {
  text-align: center;
}

.table-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1.5fr 1fr;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 4px;
  margin-bottom: 6px;
  align-items: center;
}

.your-price {
  background-color: #2C3034;
  border: 1px solid #A673B1;
}

.competitor-price {
  background-color: #1A1D20;
  border: 1px solid #2C3034;
}

.competitor-price.not-undercutting {
  background-color: #151719;
  border: 1px solid #1A1D20;
  opacity: 0.6;
}

.competitor-price.not-undercutting .cell {
  color: #6B7280;
}

.no-competitors-row {
  color: #9D7D99;
  font-style: italic;
}

.cell {
  display: flex;
  align-items: center;
}

.shop-name {
  font-weight: 400;
  color: #B1ADB3;
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.2s ease;
}

.shop-name:hover {
  color: #A673B1;
}

.sell-display, .for-display {
  justify-content: center;
}

.trade-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-stack, .currency-stack {
  display: flex;
  align-items: center;
  gap: 3px;
  background-color: #151719;
  padding: 3px 6px;
  border-radius: 3px;
}

.stack-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.stack-amount {
  font-weight: 500;
  color: #B1ADB3;
  font-size: 0.8rem;
}

.arrow-icon {
  color: #9D7D99;
  font-size: 18px;
}

.ratio {
  justify-content: center;
  font-weight: 600;
  color: #A673B1;
  font-size: 1rem;
}

.recommendation {
  text-align: center;
  padding: 12px;
  background-color: #151719;
  border-radius: 4px;
  border: 1px solid #2C3034;
}

.recommendation-text {
  color: #B1ADB3;
  font-size: 0.9rem;
  font-weight: 400;
}

.success-box, .info-box {
  margin-bottom: 16px;
  background-color: #1A1D20;
  padding: 16px;
  border-radius: 8px;
  grid-column: 1 / -1; /* Span both columns */
}

.placeholder-box {
  margin-top: 16px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  grid-column: 1 / -1;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-text {
  color: #9D7D99;
  font-size: 1rem;
  margin: 0;
}

/* Responsive: stack on mobile */
@media (max-width: 1200px) {
  .undercutter-container {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  
  .comparison-card {
    max-width: 700px;
    margin-left: auto;
    margin-right: auto;
  }
}

@media (max-width: 768px) {
  .table-header, .table-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .header-cell, .cell {
    text-align: center;
    justify-content: center;
  }
  
  .trade-display {
    flex-direction: column;
    gap: 8px;
  }
  
  .comparison-card {
    margin: 0 8px 16px 8px;
  }
}

/* Sticky Status Bar */
.sticky-status-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #1A1D20;
  border-top: 1px solid #2C3034;
  padding: 12px 16px;
  z-index: 1000;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
}

.status-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-left {
  display: flex;
  align-items: center;
}

.status-right {
  display: flex;
  align-items: center;
}

.last-updated {
  color: #9D7D99;
  font-size: 0.9rem;
}

.no-data {
  color: #666;
  font-size: 0.9rem;
  font-style: italic;
}

</style>