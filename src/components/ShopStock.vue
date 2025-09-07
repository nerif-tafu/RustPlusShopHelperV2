<template>
  <div class="shopstock-container">
    <!-- Loading State -->
    <div v-if="isLoading && myShops.length === 0" class="loading-container">
      <div class="loading-content">
        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
        <p class="loading-text">Loading shop data...</p>
      </div>
    </div>
    
    <!-- Stock Overview Section -->
    <div v-else-if="myShops.length > 0" class="section-container">
      <h3 class="section-title">Stock Overview</h3>
      <p class="section-description">Monitor the stock levels of items in your shops</p>
      
      <div class="stock-grid">
        <div v-for="shop in getSortedShops(myShops)" :key="shop.entid" class="comparison-card stock-card">
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
            <span>No items listed</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- No Shops Found Message -->
    <div v-else class="info-box">
      <v-alert type="info">
        <h3>No Shops Found</h3>
        <p>No vending machines matching your shop prefix were found.</p>
        <p>Please configure your shop prefix in the Settings page.</p>
      </v-alert>
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
              
              <img 
                ref="mapImageRef"
                :src="mapData.image" 
                alt="Rust Map" 
                class="map-image"
                @load="onMapImageLoad"
              />
              
              <!-- Shop marker -->
              <div v-if="selectedShop && mapImageSize.width" class="shop-marker" :style="getMarkerPosition(selectedShop)">
                <v-icon color="red" :size="getMarkerIconSize()">mdi-map-marker</v-icon>
                <span class="marker-label" :style="getMarkerLabelStyle()">{{ selectedShop.shopName }}</span>
              </div>
              
              <!-- Debug info -->
              <div v-if="selectedShop && showDebugInfo" class="debug-info">
                <p><strong>Raw coords:</strong> {{ selectedShop.x }}, {{ selectedShop.y }}</p>
                <p><strong>Grid coords:</strong> {{ getGridCoordinates(selectedShop) }}</p>
                <p><strong>Detected range:</strong> {{ getDetectedMapRange(selectedShop) }}</p>
                <p><strong>Normalized:</strong> {{ getNormalizedCoords(selectedShop) }}</p>
                <p><strong>Final position:</strong> {{ getFinalPosition(selectedShop) }}</p>
                <p><strong>Image size:</strong> {{ mapImageSize.width }} × {{ mapImageSize.height }}</p>
                <p><strong>Map dimensions:</strong> {{ mapData?.width || 'unknown' }} × {{ mapData?.height || 'unknown' }}</p>
              </div>
              
              <!-- Debug toggle button -->
              <v-btn 
                v-if="selectedShop"
                @click="showDebugInfo = !showDebugInfo"
                class="debug-toggle"
                size="small"
                color="primary"
                variant="outlined"
              >
                {{ showDebugInfo ? 'Hide' : 'Show' }} Debug
              </v-btn>
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
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
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
const mapImageSize = ref({ width: 0, height: 0 });
const mapImageRef = ref(null);
const showDebugInfo = ref(false);

// Load shop data on component mount
onMounted(async () => {
  await loadShopData();
  // Add resize event listener
  window.addEventListener('resize', handleResize);
});

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// Load shop data from the API
const loadShopData = async () => {
  try {
    isLoading.value = true;
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
      await cacheItemAndCurrencyNames(allyShopsData);
      lastUpdated.value = new Date();
    } else {
      console.error('Failed to load shop data:', result.error);
    }
  } catch (error) {
    console.error('Error loading shop data:', error);
  } finally {
    isLoading.value = false;
  }
};

// Refresh all data (map + vending machines) - same as undercutter
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
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    // Now refresh shop data
    console.log('Loading shop data after map refresh...');
    await loadShopData();
    
  } catch (error) {
    console.error('Error refreshing all data:', error);
  } finally {
    isLoading.value = false;
  }
}

// Show map modal
const showMapModal = async (shop) => {
  selectedShop.value = shop;
  mapModalVisible.value = true;
  await loadMapData();
};

// Load map data
const loadMapData = async () => {
  try {
    isLoadingMap.value = true;
    mapData.value = null;
    const response = await fetch('/api/rustplus/map');
    const result = await response.json();
    if (result.success) {
      mapData.value = result.data;
      // Log all shop coordinates when map loads
      if (myShops.value.length > 0) {
        console.log('=== Map Loaded - All Shop Coordinates ===');
        myShops.value.forEach(shop => {
          console.log(`${shop.shopName}: Server Coords (${shop.x}, ${shop.y})`);
        });
        console.log('==========================================');
      }
    } else {
      console.error('Failed to load map:', result.error);
    }
  } catch (error) {
    console.error('Error loading map:', error);
  } finally {
    isLoadingMap.value = false;
  }
};

// Capture rendered image size
const onMapImageLoad = () => {
  if (mapImageRef.value) {
    mapImageSize.value = {
      width: mapImageRef.value.clientWidth,
      height: mapImageRef.value.clientHeight
    };
  }
};

// Handle window resize to recalculate marker positions
const handleResize = () => {
  if (mapImageRef.value && mapModalVisible.value) {
    // Small delay to ensure the image has resized
    setTimeout(() => {
      onMapImageLoad();
    }, 100);
  }
};

// Calculate marker position
const getMarkerPosition = (shop) => {
  if (!mapData.value || !shop || !mapImageSize.value.width) return {};
  
  // Get the actual map dimensions from the map data
  const mapWidth = mapData.value.width || 4096;
  const mapHeight = mapData.value.height || 4096;
  
  // Get the displayed image dimensions
  const displayWidth = mapImageSize.value.width;
  const displayHeight = mapImageSize.value.height;
  
  // Rust uses a centered coordinate system where (0,0) is the center of the map
  // The coordinate range depends on the map size
  // Common Rust map coordinate ranges:
  // - Small maps: -1500 to 1500 (3000x3000 total)
  // - Large maps: -3000 to 3000 (6000x6000 total)  
  // - Huge maps: -4000 to 4000 (8000x8000 total)
  
  // Let's try to detect the coordinate range
  const coordRange = Math.max(Math.abs(shop.x), Math.abs(shop.y));
  let mapCoordRange;
  
  if (coordRange <= 1500) {
    mapCoordRange = 3000; // Small map
  } else if (coordRange <= 3000) {
    mapCoordRange = 6000; // Large map
  } else {
    mapCoordRange = 8000; // Huge map
  }
  
  // Convert from Rust centered coordinate system to normalized (0 to 1)
  // Rust coordinates: -mapCoordRange to +mapCoordRange
  // Normalized coordinates: 0 to 1
  const normalizedX = (shop.x + mapCoordRange) / (mapCoordRange * 2);
  
  // For Y-axis: Rust Y increases going north (positive Y = north)
  // Image Y increases going down (positive Y = south)
  // So we need to flip the Y coordinate
  const normalizedY = 1 - ((shop.y + mapCoordRange) / (mapCoordRange * 2));
  
  // Ensure coordinates are within bounds
  const clampedX = Math.max(0, Math.min(1, normalizedX));
  const clampedY = Math.max(0, Math.min(1, normalizedY));
  
  // Calculate final position on the displayed image
  const x = clampedX * displayWidth;
  const y = clampedY * displayHeight;
  
  console.log(`Map Marker - Shop: ${shop.shopName}, Server Coords: (${shop.x}, ${shop.y}), Display Position: (${x.toFixed(0)}, ${y.toFixed(0)})`);

  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    transform: 'translate(-50%, -50%)', // Center the marker on the point
    zIndex: 1000
  };
};

// Calculate responsive marker icon size based on map size
const getMarkerIconSize = () => {
  if (!mapImageSize.value.width) return 24;
  // Scale icon size based on map width (base size 24px for 400px map width)
  const baseSize = 24;
  const baseMapWidth = 400;
  const scale = Math.max(0.7, Math.min(1.5, mapImageSize.value.width / baseMapWidth));
  return Math.round(baseSize * scale);
};

// Calculate responsive marker label style
const getMarkerLabelStyle = () => {
  if (!mapImageSize.value.width) return {};
  const baseFontSize = 0.75;
  const baseMapWidth = 400;
  const scale = Math.max(0.7, Math.min(1.3, mapImageSize.value.width / baseMapWidth));
  
  return {
    fontSize: `${baseFontSize * scale}rem`
  };
};

// Debug helper functions
const getDetectedMapRange = (shop) => {
  if (!shop) return 'N/A';
  const coordRange = Math.max(Math.abs(shop.x), Math.abs(shop.y));
  if (coordRange <= 1500) return '3000 (Small)';
  if (coordRange <= 3000) return '6000 (Large)';
  return '8000 (Huge)';
};

const getNormalizedCoords = (shop) => {
  if (!shop) return 'N/A';
  const coordRange = Math.max(Math.abs(shop.x), Math.abs(shop.y));
  let mapCoordRange;
  if (coordRange <= 1500) mapCoordRange = 3000;
  else if (coordRange <= 3000) mapCoordRange = 6000;
  else mapCoordRange = 8000;
  
  const normalizedX = (shop.x + mapCoordRange) / (mapCoordRange * 2);
  const normalizedY = 1 - ((shop.y + mapCoordRange) / (mapCoordRange * 2));
  return `${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)}`;
};

const getFinalPosition = (shop) => {
  if (!shop || !mapImageSize.value.width) return 'N/A';
  const position = getMarkerPosition(shop);
  return `${position.left}, ${position.top}`;
};

// Convert Rust coordinates to grid coordinates (like what you see in-game)
const getGridCoordinates = (shop) => {
  if (!shop) return 'N/A';
  
  // Rust grid system conversion
  // The grid system appears to use a different scale than raw coordinates
  // Based on the photos, we need to convert raw coordinates to grid coordinates
  
  // Common Rust grid conversion (this may need adjustment based on your specific map)
  const gridX = Math.round(shop.x / 150) + 150; // Convert to grid X
  const gridY = Math.round(shop.y / 150) + 150; // Convert to grid Y
  
  return `${gridX}, ${gridY}`;
};

// Cache helpers
const cacheItemAndCurrencyNames = async (shops) => {
  for (const shop of shops) {
    if (shop.shopContents && Array.isArray(shop.shopContents)) {
      for (const item of shop.shopContents) {
        if (item.itemId && !itemCache.value[item.itemId]) {
          try {
            const itemDetails = await itemDatabaseService.getItemById(item.itemId);
            if (itemDetails) itemCache.value[item.itemId] = itemDetails.name;
          } catch {}
        }
        if (item.currencyId && !currencyCache.value[item.currencyId]) {
          try {
            const currencyDetails = await itemDatabaseService.getItemById(item.currencyId);
            if (currencyDetails) currencyCache.value[item.currencyId] = currencyDetails.name;
          } catch {}
        }
      }
    }
  }
};

// Helpers
const getItemImage = (itemId) => `/api/items/${itemId}/image`;
const getItemName = (itemId) => itemCache.value[itemId] || `Item ${itemId}`;
const getCurrencyImage = (currencyId) => `/api/items/${currencyId}/image`;
const getCurrencyName = (currencyId) => currencyCache.value[currencyId] || `Currency ${currencyId}`;
const getStockClass = (stock) => {
  if (!stock || stock <= 0) return 'stock-empty';
  if (stock <= 10) return 'stock-low';
  if (stock <= 50) return 'stock-medium';
  return 'stock-good';
};
const handleImageError = (event) => { if (event?.target) event.target.style.display = 'none'; };
const formatTime = (date) => date ? date.toLocaleTimeString() : '';
const getSortedShopContents = (contents) => contents ? [...contents].sort((a, b) => (a.amountInStock || 0) - (b.amountInStock || 0)) : [];

// Sort shops so those with items appear first, grouped by number of items, empty shops at the bottom
const getSortedShops = (shops) => {
  if (!shops) return [];
  
  return [...shops].sort((a, b) => {
    const aItemCount = a.shopContents ? a.shopContents.length : 0;
    const bItemCount = b.shopContents ? b.shopContents.length : 0;
    
    // Empty shops go to the bottom
    if (aItemCount === 0 && bItemCount > 0) return 1;
    if (aItemCount > 0 && bItemCount === 0) return -1;
    
    // If both are empty, sort alphabetically
    if (aItemCount === 0 && bItemCount === 0) {
      return a.shopName.localeCompare(b.shopName);
    }
    
    // For shops with items, sort by item count (descending - more items first)
    if (aItemCount !== bItemCount) {
      return bItemCount - aItemCount;
    }
    
    // If same item count, sort alphabetically by shop name
    return a.shopName.localeCompare(b.shopName);
  });
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1000;
  pointer-events: none;
}

.marker-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background-color: rgba(0, 0, 0, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
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

.debug-toggle {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1001;
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
  