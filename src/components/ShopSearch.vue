<template>
  <div class="shopsearch-container">
    <!-- Search Filters Section -->
    <div class="search-filters">
      <div class="filters-header">
        <h3 class="section-title">Shop Search</h3>
        <p class="section-description">Find specific trades across all shops on the map</p>
      </div>
      
      <div class="filters-grid">
        <!-- Selling Item Filter -->
        <div class="filter-group">
          <label class="filter-label">Selling</label>
          <v-autocomplete
            v-model="selectedSellingItem"
            :items="sellingItemOptions"
            item-title="name"
            item-value="id"
            placeholder="Select item to sell..."
            clearable
            :multiple="false"
            class="item-selector"
            @update:model-value="onSellingItemChange"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props">
                <template v-slot:prepend>
                  <img 
                    v-if="!imageError[item.raw.id]"
                    :src="`/api/items/${item.raw.id}/image`" 
                    @error="handleImageError(item.raw.id)" 
                    class="item-option-image"
                    :title="item.raw.name"
                  />
                  <div v-else class="placeholder-icon-small" :title="item.raw.name">?</div>
                </template>
              </v-list-item>
            </template>
            <template v-slot:selection="{ item }">
              <div class="selected-item">
                <img 
                  v-if="!imageError[item.raw.id]"
                  :src="`/api/items/${item.raw.id}/image`" 
                  @error="handleImageError(item.raw.id)" 
                  class="selected-item-image"
                  :title="item.raw.name"
                />
                <div v-else class="placeholder-icon-small" :title="item.raw.name">?</div>
                <span>{{ item.raw.name }}</span>
              </div>
            </template>
          </v-autocomplete>
        </div>
        
        <!-- Selling Quantity Filter -->
        <div class="filter-group">
          <label class="filter-label">Max Quantity</label>
          <v-text-field
            v-model="sellingQuantityLimit"
            type="number"
            placeholder="No limit"
            min="1"
            class="quantity-input"
            @input="onQuantityChange"
          />
        </div>
        
        <!-- For Item Filter -->
        <div class="filter-group">
          <label class="filter-label">For</label>
          <v-autocomplete
            v-model="selectedForItem"
            :items="forItemOptions"
            item-title="name"
            item-value="id"
            placeholder="Select currency..."
            clearable
            :multiple="false"
            class="item-selector"
            @update:model-value="onForItemChange"
          >
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props">
                <template v-slot:prepend>
                  <img 
                    v-if="!imageError[item.raw.id]"
                    :src="`/api/items/${item.raw.id}/image`" 
                    @error="handleImageError(item.raw.id)" 
                    class="item-option-image"
                    :title="item.raw.name"
                  />
                  <div v-else class="placeholder-icon-small" :title="item.raw.name">?</div>
                </template>
              </v-list-item>
            </template>
            <template v-slot:selection="{ item }">
              <div class="selected-item">
                <img 
                  v-if="!imageError[item.raw.id]"
                  :src="`/api/items/${item.raw.id}/image`" 
                  @error="handleImageError(item.raw.id)" 
                  class="selected-item-image"
                  :title="item.raw.name"
                />
                <div v-else class="placeholder-icon-small" :title="item.raw.name">?</div>
                <span>{{ item.raw.name }}</span>
              </div>
            </template>
          </v-autocomplete>
        </div>
        
        <!-- For Quantity Filter -->
        <div class="filter-group">
          <label class="filter-label">Max Price</label>
          <v-text-field
            v-model="forQuantityLimit"
            type="number"
            placeholder="No limit"
            min="1"
            class="quantity-input"
            @input="onQuantityChange"
          />
        </div>
        
        <!-- Filter No Stock Toggle -->
        <div class="filter-group">
          <v-switch
            v-model="hideOutOfStock"
            label="Filter no stock"
            color="primary"
            @update:model-value="debouncedFilter"
          />
        </div>
        
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading && filteredTrades.length === 0" class="loading-container">
      <div class="loading-content">
        <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
        <p class="loading-text">Loading shop data...</p>
      </div>
    </div>

    <!-- Results Section -->
    <div v-else-if="filteredTrades.length > 0" class="results-section">
      <div class="results-header">
        <h3 class="section-title">Search Results</h3>
        <div class="results-info">
          <p class="results-count">{{ filteredTrades.length }} trade{{ filteredTrades.length !== 1 ? 's' : '' }} found</p>
          <div v-if="isFiltering" class="filtering-indicator">
            <v-progress-circular indeterminate color="primary" size="16"></v-progress-circular>
            <span>Filtering...</span>
          </div>
        </div>
      </div>
      
      <div class="trades-table-container">
        <v-table class="trades-table">
          <thead>
            <tr>
              <th class="table-header">Selling</th>
              <th class="table-header">For</th>
              <th class="table-header">Shop</th>
              <th class="table-header">Stock</th>
              <th class="table-header">Ratio</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trade in paginatedTrades" :key="trade.shopId + '-' + trade.itemId + '-' + trade.currencyId + '-' + trade.quantity" class="trade-row">
              <!-- Selling Column -->
              <td class="trade-cell">
                <div class="item-stack">
                  <img 
                    v-if="!imageError[trade.itemId]"
                    :src="`/api/items/${trade.itemId}/image`" 
                    @error="handleImageError(trade.itemId)" 
                    class="stack-icon"
                    :title="getItemName(trade.itemId)"
                  />
                  <div v-else class="placeholder-icon" :title="getItemName(trade.itemId)">?</div>
                  <v-icon v-if="!trade.itemId" class="stack-icon">mdi-package</v-icon>
                  <span class="stack-amount">×{{ trade.quantity }}</span>
                </div>
              </td>
              
              <!-- For Column -->
              <td class="trade-cell">
                <div class="currency-stack">
                  <img 
                    v-if="!imageError[trade.currencyId]"
                    :src="`/api/items/${trade.currencyId}/image`" 
                    @error="handleImageError(trade.currencyId)" 
                    class="stack-icon"
                    :title="getItemName(trade.currencyId)"
                  />
                  <div v-else class="placeholder-icon" :title="getItemName(trade.currencyId)">?</div>
                  <v-icon v-if="!trade.currencyId" class="stack-icon">mdi-currency-usd</v-icon>
                  <span class="stack-amount">×{{ trade.costPerItem }}</span>
                </div>
              </td>
              
              <!-- Shop Column -->
              <td class="trade-cell">
                <div class="shop-cell" @click="showMapModal(trade)">
                  <v-icon class="shop-icon">mdi-store</v-icon>
                  <span class="shop-name">{{ trade.shopName }}</span>
                </div>
              </td>
              
              <!-- Stock Column -->
              <td class="trade-cell">
                <span class="stock-count" :class="getStockClass(trade.stock)">
                  {{ trade.stock }}
                </span>
              </td>
              
              <!-- Ratio Column -->
              <td class="trade-cell">
                <span class="ratio-text">
                  {{ getPricePerUnit(trade.costPerItem, trade.quantity) }}
                </span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
      
      <!-- Pagination Controls -->
      <div v-if="totalPages > 1" class="pagination-container">
        <div class="pagination-info">
          Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to {{ Math.min(currentPage * itemsPerPage, totalTrades) }} of {{ totalTrades }} trades
        </div>
        <div class="pagination-controls">
          <v-btn
            @click="prevPage"
            :disabled="currentPage === 1"
            size="small"
            variant="outlined"
            class="pagination-btn"
          >
            <v-icon left>mdi-chevron-left</v-icon>
            Previous
          </v-btn>
          
          <div class="page-numbers">
            <v-btn
              v-for="page in getVisiblePages()"
              :key="page"
              @click="goToPage(page)"
              :color="page === currentPage ? 'primary' : 'default'"
              :variant="page === currentPage ? 'flat' : 'outlined'"
              size="small"
              class="page-btn"
            >
              {{ page }}
            </v-btn>
          </div>
          
          <v-btn
            @click="nextPage"
            :disabled="currentPage === totalPages"
            size="small"
            variant="outlined"
            class="pagination-btn"
          >
            Next
            <v-icon right>mdi-chevron-right</v-icon>
          </v-btn>
        </div>
      </div>
    </div>
    
    <!-- No Results -->
    <div v-else class="no-results">
      <v-alert type="info">
        <h3>No Trades Found</h3>
        <p>No trades match your current search criteria.</p>
        <p>Try adjusting your filters or clearing them to see all available trades.</p>
      </v-alert>
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
  </template>
  
  <script setup>
import { ref, onMounted, computed, watch } from 'vue';
import itemDatabaseService from '../services/itemDatabaseService.js';

// State variables
const allTrades = ref([]);
const isLoading = ref(false);
const lastUpdated = ref(null);
const itemCache = ref({});
const imageError = ref({});

// Search filters
const selectedSellingItem = ref(null);
const selectedForItem = ref(null);
const sellingQuantityLimit = ref('');
const forQuantityLimit = ref('');
const hideOutOfStock = ref(false);

// Performance optimizations
const currentPage = ref(1);
const itemsPerPage = ref(10);
const debounceTimer = ref(null);
const isFiltering = ref(false);

// Load data on component mount
onMounted(async () => {
  await loadAllShopData();
});

// Load all shop data from the API
const loadAllShopData = async () => {
  try {
    isLoading.value = true;
    
    const response = await fetch('/api/rustplus/vendingMachines?prefix=');
    const result = await response.json();
    
    if (result.success) {
      const { allyShops, enemyShops } = result.data;
      const allShops = [...allyShops, ...enemyShops];
      
      // Flatten all trades from all shops
      allTrades.value = [];
      allShops.forEach(shop => {
        if (shop.shopContents && Array.isArray(shop.shopContents)) {
          shop.shopContents.forEach(item => {
            allTrades.value.push({
              shopId: shop.entid,
              shopName: shop.shopName,
              x: shop.x,
              y: shop.y,
              itemId: item.itemId,
              quantity: item.quantity || 1,
              costPerItem: item.costPerItem,
              currencyId: item.currencyId,
              stock: item.amountInStock || 0
            });
          });
        }
      });
      
      await cacheItemNames();
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
    
    // Wait a moment for map data to update, then refresh shop data
    console.log('Waiting for map data to update...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    // Now refresh shop data
    console.log('Loading shop data after map refresh...');
    await loadAllShopData();
    
  } catch (error) {
    console.error('Error refreshing all data:', error);
  } finally {
    isLoading.value = false;
  }
}

// Cache item names for display
const cacheItemNames = async () => {
  const uniqueItemIds = new Set();
  allTrades.value.forEach(trade => {
    uniqueItemIds.add(trade.itemId);
    uniqueItemIds.add(trade.currencyId);
  });
  
  for (const itemId of uniqueItemIds) {
    if (!itemCache.value[itemId]) {
      try {
        const itemDetails = await itemDatabaseService.getItemById(itemId);
        if (itemDetails) itemCache.value[itemId] = itemDetails.name;
      } catch {}
    }
  }
};

// Computed properties
const itemOptions = computed(() => {
  const uniqueItems = new Set();
  allTrades.value.forEach(trade => {
    uniqueItems.add(trade.itemId);
    uniqueItems.add(trade.currencyId);
  });
  
  return Array.from(uniqueItems).map(itemId => ({
    id: itemId,
    name: itemCache.value[itemId] || `Item ${itemId}`
  })).sort((a, b) => a.name.localeCompare(b.name));
});

const sellingItemOptions = computed(() => {
  return itemOptions.value.filter(item => item.id !== selectedForItem.value);
});

const forItemOptions = computed(() => {
  return itemOptions.value.filter(item => item.id !== selectedSellingItem.value);
});

const filteredTrades = computed(() => {
  let filtered = [...allTrades.value];
  
  // Filter by selling item
  if (selectedSellingItem.value) {
    filtered = filtered.filter(trade => trade.itemId === selectedSellingItem.value);
  }
  
  // Filter by for item (currency)
  if (selectedForItem.value) {
    filtered = filtered.filter(trade => trade.currencyId === selectedForItem.value);
  }
  
  // Filter by selling quantity limit
  if (sellingQuantityLimit.value) {
    const limit = parseInt(sellingQuantityLimit.value);
    if (!isNaN(limit)) {
      filtered = filtered.filter(trade => trade.quantity <= limit);
    }
  }
  
  // Filter by for quantity limit (price)
  if (forQuantityLimit.value) {
    const limit = parseInt(forQuantityLimit.value);
    if (!isNaN(limit)) {
      filtered = filtered.filter(trade => trade.costPerItem <= limit);
    }
  }
  
  // Filter out of stock
  if (hideOutOfStock.value) {
    filtered = filtered.filter(trade => trade.stock > 0);
  }
  
  // Sort by: item ID, then currency ID, then ratio (ascending - cheapest first)
  // Use IDs instead of names to avoid async dependency
  return filtered.sort((a, b) => {
    // First sort by selling item ID
    if (a.itemId !== b.itemId) {
      return a.itemId - b.itemId;
    }
    
    // Then sort by currency ID
    if (a.currencyId !== b.currencyId) {
      return a.currencyId - b.currencyId;
    }
    
    // Finally sort by ratio (price per unit)
    const aPricePerUnit = a.costPerItem / a.quantity;
    const bPricePerUnit = b.costPerItem / b.quantity;
    return aPricePerUnit - bPricePerUnit;
  });
});

// SIMPLE PAGINATION - Force exactly 10 items per page
const totalTrades = computed(() => filteredTrades.value.length);

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(totalTrades.value / itemsPerPage.value));
});

const paginatedTrades = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return filteredTrades.value.slice(start, end);
});

// Show loading indicator when filtering
const isProcessing = computed(() => {
  return isLoading.value || isFiltering.value;
});

// Debounced filtering for performance
const debouncedFilter = () => {
  if (debounceTimer.value) clearTimeout(debounceTimer.value);

  isFiltering.value = true;
  debounceTimer.value = setTimeout(() => {
    resetToFirstPage(); // Reset first
    isFiltering.value = false;
  }, 300);
};

// Event handlers
const onSellingItemChange = () => {
  debouncedFilter();
};

const onForItemChange = () => {
  debouncedFilter();
};

const onQuantityChange = () => {
  debouncedFilter();
};

// SIMPLE PAGINATION FUNCTIONS
const goToPage = (page) => {
  const targetPage = parseInt(page);
  if (targetPage >= 1 && targetPage <= totalPages.value) {
    currentPage.value = targetPage;
  }
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
};

const resetToFirstPage = () => {
  currentPage.value = 1;
};

// Get visible page numbers for pagination
const getVisiblePages = () => {
  const total = totalPages.value;
  const current = currentPage.value;
  const pages = [];
  
  if (total <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Show smart pagination
    if (current <= 4) {
      // Show first 5 pages + ... + last page
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 3) {
      // Show first page + ... + last 5 pages
      pages.push(1);
      pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      // Show first + ... + current-1, current, current+1 + ... + last
      pages.push(1);
      pages.push('...');
      for (let i = current - 1; i <= current + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    }
  }
  
  return pages;
};


// Map modal functions (placeholder for now)
const showMapModal = async (trade) => {
  console.log('Show map for trade:', trade);
  // TODO: Implement map modal
};

// Helper functions
const getItemName = (itemId) => itemCache.value[itemId] || `Item ${itemId}`;
const getPricePerUnit = (cost, quantity) => (cost / quantity).toFixed(2);
const getStockClass = (stock) => {
  if (!stock || stock <= 0) return 'stock-empty';
  if (stock <= 10) return 'stock-low';
  if (stock <= 50) return 'stock-medium';
  return 'stock-good';
};
const handleImageError = (itemId) => {
  imageError.value[itemId] = true;
};
const formatTime = (date) => date ? date.toLocaleTimeString() : '';
  </script>
  
<style scoped>
.shopsearch-container {
  padding: 16px;
  padding-bottom: 80px; /* Space for sticky status bar */
  max-width: 1400px;
  margin: 0 auto;
}

/* Search Filters */
.search-filters {
  background-color: #1A1D20;
  border: 1px solid #2C3034;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
}

.filters-header {
  margin-bottom: 24px;
  text-align: center;
}

.section-title {
  margin-bottom: 8px;
  font-size: 1.3rem;
  color: #B1ADB3;
  font-weight: bold;
}

.section-description {
  color: #9D7D99;
  font-size: 0.9rem;
  margin: 0;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  align-items: end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  color: #B1ADB3;
  font-size: 0.9rem;
  font-weight: 500;
}

.item-selector {
  background-color: #2C3034;
}

.quantity-input {
  background-color: #2C3034;
}


/* Item selector styling */
.item-option-image, .selected-item-image {
  width: 24px;
  height: 24px;
  object-fit: contain;
  margin-right: 8px;
}

.selected-item {
  display: flex;
  align-items: center;
}

/* Results */
.results-section {
  margin-bottom: 24px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.results-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.results-count {
  color: #9D7D99;
  font-size: 0.9rem;
}

.filtering-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9D7D99;
  font-size: 0.8rem;
}

/* Table Styles */
.trades-table-container {
  background-color: #1A1D20;
  border: 1px solid #2C3034;
  border-radius: 8px;
  overflow: hidden;
}

.trades-table {
  background-color: transparent;
}

.table-header {
  background-color: #231E29;
  color: #B1ADB3;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 16px 12px;
  border-bottom: 1px solid #2C3034;
}

.trade-row {
  border-bottom: 1px solid #2C3034;
  transition: background-color 0.2s ease;
}

.trade-row:hover {
  background-color: #1F2225;
}

.trade-row:last-child {
  border-bottom: none;
}

.trade-cell {
  padding: 12px;
  vertical-align: middle;
}

.item-stack, .currency-stack {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stack-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.placeholder-icon {
  width: 20px;
  height: 20px;
  background-color: #2C3034;
  border: 1px solid #4A4A4A;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9D7D99;
  font-size: 12px;
  font-weight: bold;
}

.placeholder-icon-small {
  width: 24px;
  height: 24px;
  background-color: #2C3034;
  border: 1px solid #4A4A4A;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9D7D99;
  font-size: 14px;
  font-weight: bold;
}

.stack-amount {
  font-weight: 500;
  color: #B1ADB3;
  font-size: 0.8rem;
}

.shop-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.shop-cell:hover {
  color: #A673B1;
}

.shop-icon {
  color: #B1ADB3;
  font-size: 18px;
}

.shop-name {
  color: #B1ADB3;
  font-weight: 500;
  font-size: 0.9rem;
}

.shop-cell:hover .shop-name {
  color: #A673B1;
}

.stock-count {
  font-size: 0.9rem;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #151719;
  display: inline-block;
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

.ratio-text {
  color: #B1ADB3;
  font-weight: 500;
  font-size: 0.9rem;
}

/* Pagination Styles */
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding: 16px;
  background-color: #1A1D20;
  border: 1px solid #2C3034;
  border-radius: 8px;
}

.pagination-info {
  color: #9D7D99;
  font-size: 0.9rem;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-btn {
  background-color: #2C3034 !important;
  color: #B1ADB3 !important;
  border-color: #2C3034 !important;
}

.pagination-btn:hover {
  background-color: #A673B1 !important;
  color: white !important;
}

.page-numbers {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-btn {
  min-width: 32px !important;
  height: 32px !important;
  background-color: #2C3034 !important;
  color: #B1ADB3 !important;
  border-color: #2C3034 !important;
}

.page-btn:hover {
  background-color: #A673B1 !important;
  color: white !important;
}

/* Active page button styling */
.page-btn.v-btn--variant-flat {
  background-color: #A673B1 !important;
  color: white !important;
  border-color: #A673B1 !important;
}

.page-btn.v-btn--variant-flat:hover {
  background-color: #9A5FA0 !important;
  color: white !important;
}

/* Loading and empty states */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
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

.no-results {
  margin-top: 24px;
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
  .filters-grid {
    grid-template-columns: 1fr;
  }
  
  .trades-table-container {
    overflow-x: auto;
  }
  
  .trades-table {
    min-width: 600px;
  }
  
  .table-header,
  .trade-cell {
    padding: 8px 6px;
    font-size: 0.8rem;
  }
  
  .stack-icon {
    width: 18px;
    height: 18px;
  }
  
  .stack-amount {
    font-size: 0.7rem;
  }
  
  .pagination-container {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  
  .pagination-controls {
    justify-content: center;
  }
  
  .page-numbers {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>