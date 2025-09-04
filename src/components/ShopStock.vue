<template>
  <div class="shopstock-container">
    <!-- Header -->
    <div class="header-controls" style="grid-column: 1 / -1; margin-bottom: 16px;">
    </div>

    <!-- Stock Overview Section -->
    <div class="section-container">
      <h3 class="section-title">Stock Overview</h3>
      <p class="section-description">Monitor the stock levels of items in your shops</p>
      
      <div v-if="myShops.length > 0" class="stock-grid">
        <div v-for="shop in myShops" :key="shop.entid" class="comparison-card stock-card">
          <!-- Shop header -->
          <div class="item-header">
            <div class="item-info">
              <v-icon class="item-icon">mdi-store</v-icon>
              <span class="item-name shop-name" @click="showMapModal(shop)">{{ shop.shopName }}</span>
            </div>
          </div>
          
          <div v-if="shop.shopContents && shop.shopContents.length > 0" class="comparison-table">
            <div class="table-header">
              <div class="header-cell">Item</div>
              <div class="header-cell">Sell</div>
              <div class="header-cell">For</div>
              <div class="header-cell">Stock</div>
            </div>
            
            <div v-for="item in getSortedShopContents(shop.shopContents)" :key="`${shop.entid}-${item.itemId}`" class="table-row item-row">
              <div class="cell item-name-cell">
                <span class="stack-amount">{{ getItemName(item.itemId) }}</span>
              </div>
              
              <div class="cell sell-display">
                <div class="item-stack">
                  <img v-if="getItemImage(item.itemId)" :src="getItemImage(item.itemId)" @error="handleImageError" class="stack-icon" />
                  <v-icon v-else class="stack-icon">mdi-package</v-icon>
                  <span class="stack-amount">×{{ item.quantity }}</span>
                </div>
              </div>
              
              <div class="cell for-display">
                <div class="currency-stack">
                  <img v-if="getCurrencyImage(item.currencyId)" :src="getCurrencyImage(item.currencyId)" @error="handleImageError" class="stack-icon" />
                  <v-icon v-else class="stack-icon">mdi-currency-usd</v-icon>
                  <span class="stack-amount">×{{ item.costPerItem }}</span>
                </div>
              </div>
              
              <div class="cell stock-cell">
                <span class="stock-value" :class="getStockClass(item.amountInStock)">
                  {{ item.amountInStock || 0 }}
                </span>
              </div>
            </div>
          </div>
          
          <div v-else class="no-items">
            <v-icon class="no-items-icon">mdi-package-variant-closed</v-icon>
            <span>No items in stock</span>
          </div>
        </div>
      </div>
      
      <div v-else class="info-box">
        <v-alert type="info">
          <h3>No Shops Found</h3>
          <p>No vending machines matching your shop prefix were found.</p>
          <p>Please configure your shop prefix in the Settings page.</p>
        </v-alert>
      </div>
    </div>

    <!-- Map Modal -->
    <v-dialog v-model="mapModalVisible" max-width="800px">
      <v-card class="map-modal">
        <v-card-title class="map-modal-title">
          <span>Map View</span>
          <v-btn icon @click="mapModalVisible = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        
        <v-card-text class="map-modal-content">
          <div v-if="isLoadingMap" class="map-loading">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
            <span>Loading map...</span>
          </div>
          
          <div v-else-if="mapData" class="map-container">
            <div v-if="mapData.image" class="map-image-wrapper">
              <!-- Shop location info -->
              <div v-if="selectedShop" class="shop-location-info">
                <strong>{{ selectedShop.shopName }}</strong> - Grid: {{ selectedShop.x.toFixed(0) }}, {{ selectedShop.y.toFixed(0) }}
              </div>
              
              <img :src="mapData.image" alt="Rust Map" class="map-image" />
              
              <!-- Shop marker -->
              <div v-if="selectedShop" class="shop-marker" :style="getMarkerPosition(selectedShop)">
                <v-icon color="red" size="24">mdi-map-marker</v-icon>
                <span class="marker-label">{{ selectedShop.shopName }}</span>
              </div>
              
              <!-- Simple fallback marker (red dot) -->
              <div v-if="selectedShop" class="fallback-marker" :style="getMarkerPosition(selectedShop)">
                <div class="marker-dot"></div>
              </div>
              
              <!-- Position indicator dot -->
              <div v-if="selectedShop" class="position-dot" :style="getMarkerPosition(selectedShop)">
                <div class="dot"></div>
              </div>
              
              <!-- Debug info -->
              <div v-if="selectedShop" class="debug-info">
                <p>Marker should be at: {{ getMarkerPosition(selectedShop) }}</p>
                <p>Shop coords: {{ selectedShop.x }}, {{ selectedShop.y }}</p>
              </div>
            </div>
            <div v-else class="map-data-info">
              <p>Map data received but no image found.</p>
              <p>Map data structure: {{ JSON.stringify(mapData, null, 2) }}</p>
            </div>
          </div>
          
          <div v-else class="map-error">
            <v-icon color="error" size="48">mdi-map-marker-off</v-icon>
            <span>Failed to load map data</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

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
            @click="loadShopData" 
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
</template>

<script setup>
import { ref, onMounted } from 'vue';
import itemDatabaseService from '../services/itemDatabaseService.js';

// State variables
const myShops = ref([]);
const isLoading = ref(false);
const lastUpdated = ref(null);
const currencyCache = ref({});
const itemCache = ref({});

// Map modal state
const mapModalVisible = ref(false);
const isLoadingMap = ref(false);
const mapData = ref(null);
const selectedShop = ref(null);

// Load shop data on component mount
onMounted(async () => {
  await loadShopData();
});

// Load shop data from the API
const loadShopData = async () => {
  try {
    isLoading.value = true;
    
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
      const { allyShops: allyShopsData } = result.data;
      myShops.value = allyShopsData;
      
      // Cache item and currency names for display
      await cacheItemAndCurrencyNames(allyShopsData);
      
      lastUpdated.value = new Date();
      console.log('Shop data loaded successfully:', allyShopsData);
    } else {
      console.error('Failed to load shop data:', result.error);
    }
  } catch (error) {
    console.error('Error loading shop data:', error);
  } finally {
    isLoading.value = false;
  }
};

// Show map modal and load map data
const showMapModal = async (shop) => {
  selectedShop.value = shop;
  mapModalVisible.value = true;
  await loadMapData();
};

// Load map data from the Rust+ API
const loadMapData = async () => {
  try {
    isLoadingMap.value = true;
    mapData.value = null;
    
    console.log('Fetching map data...');
    const response = await fetch('/api/rustplus/map');
    
    console.log('Map response status:', response.status);
    
    const result = await response.json();
    console.log('Map response received:', result);
    
    if (result.success) {
      mapData.value = result.data;
      console.log('Map data set:', mapData.value);
    } else {
      console.error('Failed to load map:', result.error);
      if (result.details) {
        console.log('Connection details:', result.details);
      }
    }
  } catch (error) {
    console.error('Error loading map:', error);
  } finally {
    isLoadingMap.value = false;
  }
};

// Calculate marker position on the map
const getMarkerPosition = (shop) => {
  if (!mapData.value || !shop) {
    console.log('Cannot calculate marker position:', { mapData: mapData.value, shop });
    return {};
  }
  
  // Get actual map dimensions from the API response
  const mapWidth = mapData.value.width || 4096;
  const mapHeight = mapData.value.height || 4096;
  
  // Modal map display size (this should match the CSS max-width)
  const modalWidth = 800;
  const modalHeight = 600; // Approximate height for the modal
  
  // Convert Rust grid coordinates to pixel position on the modal map
  // Rust coordinates are typically 0-4096, but we use the actual dimensions from the API
  const x = (shop.x / mapWidth) * modalWidth;
  const y = (shop.y / mapHeight) * modalHeight;
  
  console.log('Marker positioning:', {
    shop: shop.shopName,
    shopCoords: { x: shop.x, y: shop.y },
    mapDimensions: { width: mapWidth, height: mapHeight },
    modalDimensions: { width: modalWidth, height: modalHeight },
    calculatedPosition: { x: Math.round(x), y: Math.round(y) }
  });
  
  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    transform: 'translate(-50%, -100%)', // Center the marker horizontally, anchor to bottom
    zIndex: 1000
  };
};

// Cache item and currency names for better performance
const cacheItemAndCurrencyNames = async (shops) => {
  for (const shop of shops) {
    if (shop.shopContents && Array.isArray(shop.shopContents)) {
      for (const item of shop.shopContents) {
        // Cache item name
        if (item.itemId && !itemCache.value[item.itemId]) {
          try {
            const itemDetails = await itemDatabaseService.getItemById(item.itemId);
            if (itemDetails) {
              itemCache.value[item.itemId] = itemDetails.name;
            }
          } catch (error) {
            console.log('Could not get item details for ID:', item.itemId);
          }
        }
        
        // Cache currency name
        if (item.currencyId && !currencyCache.value[item.currencyId]) {
          try {
            const currencyDetails = await itemDatabaseService.getItemById(item.currencyId);
            if (currencyDetails) {
              currencyCache.value[item.currencyId] = currencyDetails.name;
            }
          } catch (error) {
            console.log('Could not get currency details for ID:', item.currencyId);
          }
        }
      }
    }
  }
};

// Helper functions
const getItemImage = (itemId) => {
  return `/api/items/${itemId}/image`;
};

const getItemName = (itemId) => {
  return itemCache.value[itemId] || `Item ${itemId}`;
};

const getCurrencyImage = (currencyId) => {
  return `/api/items/${currencyId}/image`;
};

const getCurrencyName = (currencyId) => {
  return currencyCache.value[currencyId] || `Currency ${currencyId}`;
};

const getStockClass = (stock) => {
  if (!stock || stock <= 0) return 'stock-empty';
  if (stock <= 10) return 'stock-low';
  if (stock <= 50) return 'stock-medium';
  return 'stock-good';
};

const handleImageError = (event) => {
  if (event && event.target) {
    event.target.style.display = 'none';
  }
};

const formatTime = (date) => {
  if (!date) return '';
  return date.toLocaleTimeString();
};

// Function to sort shop contents by stock level (low to high)
const getSortedShopContents = (shopContents) => {
  if (!shopContents || shopContents.length === 0) {
    return [];
  }
  return [...shopContents].sort((a, b) => (a.amountInStock || 0) - (b.amountInStock || 0));
};
</script>

<style scoped>
.shopstock-container {
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
  grid-column: 1 / -1;
}

.page-title {
  color: #B1ADB3;
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0;
}

.section-container {
  margin-top: 24px;
  grid-column: 1 / -1;
}

.section-title {
  margin-bottom: 10px;
  font-size: 1.3rem;
  text-align: center;
  color: #B1ADB3;
}

.section-description {
  text-align: center;
  color: #9D7D99;
  margin-bottom: 24px;
}

.stock-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.stock-card {
  background-color: #1F2225;
  border: 1px solid #2C3034;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
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
  color: #B1ADB3;
}

.item-name {
  font-size: 1.1rem;
  font-weight: 500;
  color: #B1ADB3;
}

.shop-name {
  cursor: pointer;
  transition: color 0.2s ease;
}

.shop-name:hover {
  color: #A673B1; /* Highlight color on hover */
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

.item-row {
  background-color: #2C3034;
  border: 1px solid #A673B1;
}

.cell {
  display: flex;
  align-items: center;
}

.item-name-cell {
  justify-content: flex-start;
}

.sell-display, .for-display {
  justify-content: center;
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

.stock-cell {
  justify-content: center;
}

.stock-value {
  font-weight: 500;
  color: #B1ADB3;
  font-size: 0.8rem;
  background-color: #151719;
  padding: 3px 6px;
  border-radius: 3px;
  min-width: 40px;
  text-align: center;
}

.stock-empty {
  color: #ff6b6b;
  background-color: rgba(255, 107, 107, 0.1);
}

.stock-low {
  color: #ffa726;
  background-color: rgba(255, 167, 38, 0.1);
}

.stock-medium {
  color: #ffd54f;
  background-color: rgba(255, 213, 79, 0.1);
}

.stock-good {
  color: #66bb6a;
  background-color: rgba(102, 187, 106, 0.1);
}

.no-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #666;
}

.no-items-icon {
  font-size: 2rem;
  color: #666;
}

.info-box {
  margin-top: 24px;
  grid-column: 1 / -1;
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

.refresh-btn {
  background-color: #A673B1 !important;
  color: white !important;
}

/* Responsive Design */
@media (max-width: 768px) {
  .shopstock-container {
    grid-template-columns: 1fr;
  }
  
  .table-header,
  .table-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .header-cell {
    text-align: left;
    font-weight: bold;
    color: #9D7D99;
  }
  
  .cell {
    justify-content: flex-start;
  }
  
  .item-name-cell {
    justify-content: flex-start;
  }
}

/* Map Modal Styles */
.map-modal {
  background-color: #1A1D20;
  border: 1px solid #2C3034;
  border-radius: 8px;
  overflow: hidden;
}

.map-modal-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background-color: #231E29;
  border-bottom: 1px solid #2C3034;
  color: #B1ADB3;
  font-size: 1.1rem;
  font-weight: 500;
}

.map-modal-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.map-loading, .map-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #9D7D99;
  font-size: 0.9rem;
}

.map-container {
  position: relative;
  width: 100%;
}

.map-image-wrapper {
  position: relative;
  width: 100%;
}

.map-image {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.map-data-info {
  padding: 16px;
  background-color: #2C3034;
  border-radius: 4px;
  color: #B1ADB3;
  font-family: monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.shop-marker {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  border: 2px solid red;
  min-width: 40px;
  min-height: 40px;
}

.marker-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.debug-info {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  z-index: 1001;
  max-width: 200px;
}

.shop-location-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.test-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  border: 2px solid blue;
  min-width: 40px;
  min-height: 40px;
}

.test-dot {
  width: 10px;
  height: 10px;
  background-color: blue;
  border-radius: 50%;
}

.fallback-marker {
  position: absolute;
  z-index: 999;
  pointer-events: none;
}

.marker-dot {
  width: 20px;
  height: 20px;
  background-color: red;
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
}

.position-dot {
  position: absolute;
  z-index: 998;
  pointer-events: none;
}

.dot {
  width: 8px;
  height: 8px;
  background-color: yellow;
  border-radius: 50%;
  border: 2px solid black;
  box-shadow: 0 0 5px rgba(255, 255, 0, 0.8);
}
</style>
  