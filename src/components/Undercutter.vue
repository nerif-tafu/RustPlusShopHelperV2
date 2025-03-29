<template>
  <div class="undercutter-container">
    <!-- Header Section -->
    <div class="d-flex justify-space-between align-center mb-4">
      <h2 :style="getTitleStyle()">Shop Undercutter</h2>
      <v-btn
        color="primary"
        size="small"
        @click="refreshVendingMachines"
        :loading="isLoading"
        :disabled="!isConnected"
        :style="getButtonStyle()"
      >
        <v-icon class="mr-1">mdi-refresh</v-icon>
        Refresh
      </v-btn>
    </div>

    <!-- Shop Prefix Section -->
    <div class="shop-prefix-section mb-4" :style="getBoxStyle()">
      <div class="pa-4">
        <div class="text-subtitle-1 mb-2" :style="getTitleStyle()">
          Shop Prefix Settings
        </div>
        <p class="text-body-2 mb-3" :style="getNormalTextStyle()">
          Set a prefix to identify your vending machines. We'll monitor other shops to detect undercutting.
        </p>
        
        <div class="d-flex align-center">
          <v-text-field
            v-model="shopPrefix"
            label="Your Shop Prefix"
            variant="outlined"
            density="compact"
            hint="Example: [MyShop] or YourName's"
            persistent-hint
            :disabled="!isConnected"
            class="flex-grow-1"
            @change="saveShopPrefix"
          ></v-text-field>
        </div>
      </div>
    </div>

    <!-- Connection Status Alert -->
    <v-alert
      v-if="!isConnected"
      type="warning"
      class="mb-4"
      title="Not Connected"
      text="Connect to a Rust server in Settings to use this feature."
      variant="tonal"
    ></v-alert>

    <!-- No Prefix Warning -->
    <v-alert
      v-else-if="isConnected && !shopPrefix"
      type="info"
      class="mb-4"
      title="Shop Prefix Required"
      text="Set your shop prefix above to start monitoring for undercutting."
      variant="tonal"
    ></v-alert>

    <!-- Debug Information Section -->
    <div v-if="isConnected && shopPrefix && allVendingMachines.length > 0 && myVendingMachines.length === 0" class="mb-4" :style="getBoxStyle()">
      <div class="pa-4">
        <div class="text-subtitle-1 mb-2" :style="getTitleStyle()">
          Debugging Information
        </div>
        <p class="text-body-2 mb-3" :style="getNormalTextStyle()">
          We found {{ allVendingMachines.length }} vending machines, but none with your prefix "{{ shopPrefix }}".
        </p>
        <div class="text-caption mb-2" :style="getCaptionStyle()">
          Vending machine names found:
        </div>
        <v-chip-group>
          <v-chip
            v-for="(machine, index) in allVendingMachines.slice(0, 10)"
            :key="index"
            size="small"
            class="mr-1 mb-1"
          >
            {{ machine.name }}
          </v-chip>
          <v-chip v-if="allVendingMachines.length > 10" size="small">
            +{{ allVendingMachines.length - 10 }} more
          </v-chip>
        </v-chip-group>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="my-4">
      <div v-for="i in 3" :key="i" class="undercutter-skeleton mb-3" :style="getServerBoxStyle()">
        <div class="pa-4">
          <div class="skeleton-title mb-2" :style="getSkeletonStyle()"></div>
          <div class="skeleton-subtitle mb-3" :style="getSkeletonStyle()"></div>
          <div v-for="j in 2" :key="j" class="d-flex mb-2">
            <div class="skeleton-icon mr-2" :style="getSkeletonStyle()"></div>
            <div class="skeleton-text flex-grow-1" :style="getSkeletonStyle()"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Vending Machine Results -->
    <div v-else-if="myVendingMachines.length > 0" class="vending-machines-list">
      <div 
        v-for="machine in myVendingMachines" 
        :key="machine.id" 
        class="vending-machine-card mb-3"
        :style="getServerBoxStyle()"
      >
        <div class="pa-4">
          <div class="d-flex justify-space-between align-center">
            <div class="text-subtitle-1" :style="getTitleStyle()">{{ machine.name }}</div>
            <v-chip
              size="small"
              :color="machine.hasUndercutItems ? 'error' : 'success'"
              variant="tonal"
            >
              {{ machine.hasUndercutItems ? 'Being Undercut' : 'Competitive' }}
            </v-chip>
          </div>
          
          <div class="text-caption mb-3" :style="getCaptionStyle()">
            Location: {{ formatCoordinates(machine.x, machine.y) }}
          </div>
          
          <v-divider class="mb-3"></v-divider>
          
          <div v-if="machine.sellOrders && machine.sellOrders.length > 0">
            <div v-for="(order, index) in machine.sellOrders" :key="index" class="sell-order mb-3">
              <div class="d-flex justify-space-between align-items-start">
                <!-- Item info -->
                <div class="d-flex">
                  <div class="sell-order-icon mr-2">
                    <v-avatar size="36" color="grey-lighten-3">
                      <v-icon>mdi-package-variant-closed</v-icon>
                    </v-avatar>
                  </div>
                  <div>
                    <div class="text-body-2" :style="getNormalTextStyle()">
                      {{ order.itemName || `Item #${order.itemId}` }}
                      <span v-if="order.itemIsBlueprint" class="text-caption">(BP)</span>
                    </div>
                    <div class="text-caption" :style="getCaptionStyle()">
                      {{ order.quantity }}x for {{ order.costPerItem }} 
                      <span v-if="order.currencyName">{{ order.currencyName }}</span>
                      <span v-else>Item #{{ order.currencyId }}</span>
                      <span v-if="order.currencyIsBlueprint" class="text-caption">(BP)</span>
                    </div>
                  </div>
                </div>
                
                <!-- Undercut status -->
                <div v-if="order.undercutBy" class="ml-auto">
                  <v-chip
                    size="small"
                    color="error"
                    variant="tonal"
                  >
                    Undercut by {{ order.undercutBy }}
                  </v-chip>
                </div>
                <div v-else>
                  <v-chip
                    size="small"
                    color="success"
                    variant="tonal"
                  >
                    Best Price
                  </v-chip>
                </div>
              </div>
              
              <!-- Competitors section if being undercut -->
              <div v-if="order.competitors && order.competitors.length > 0" class="mt-2">
                <v-expansion-panels variant="accordion">
                  <v-expansion-panel>
                    <v-expansion-panel-title>
                      <div class="text-caption">{{ order.competitors.length }} competing offer(s)</div>
                    </v-expansion-panel-title>
                    <v-expansion-panel-text>
                      <div v-for="(competitor, i) in order.competitors" :key="i" class="competitor-item text-caption py-1">
                        <strong>{{ competitor.shopName }}</strong>: {{ competitor.quantity }}x for {{ competitor.price }}
                        <v-chip
                          size="x-small"
                          :color="competitor.isUndercutting ? 'error' : 'grey'"
                          class="ml-1"
                        >
                          {{ competitor.isUndercutting ? 'Undercutter' : 'Same/Higher' }}
                        </v-chip>
                      </div>
                    </v-expansion-panel-text>
                  </v-expansion-panel>
                </v-expansion-panels>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-2" :style="getNormalTextStyle()">
            No items for sale in this vending machine
          </div>
        </div>
      </div>
    </div>

    <!-- No Vending Machines Found -->
    <v-alert
      v-else-if="shopPrefix && !isLoading"
      type="info"
      class="mb-4"
      title="No Vending Machines Found"
      text="We couldn't find any vending machines with your prefix. Make sure your prefix is correct."
      variant="tonal"
    ></v-alert>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useStyleUtils } from '@/utils/styleUtils';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useTheme } from 'vuetify';

// Import shared style utilities
const { 
  getBoxStyle, 
  getServerBoxStyle, 
  getTitleStyle, 
  getNormalTextStyle, 
  getCaptionStyle, 
  getButtonStyle 
} = useStyleUtils();

// State variables
const shopPrefix = ref('');
const isLoading = ref(false);
const isConnected = ref(false);
const vendingMachines = ref([]);
const allVendingMachines = ref([]);
const rustplusStatus = ref({
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null
});
const socket = io();

// Custom skeleton loader styling function
const getSkeletonStyle = () => {
  return {
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    opacity: 0.7,
    animation: 'pulse 1.5s infinite ease-in-out',
    borderRadius: '4px',
  };
};

// Computed: Get vending machines that have the shop prefix in their name
const myVendingMachines = computed(() => {
  if (!shopPrefix.value) return [];
  
  // Filter vending machines that have our prefix (case insensitive)
  return vendingMachines.value.filter(machine => {
    if (!machine.name) return false;
    
    // Try different approaches to matching the prefix
    const machineName = String(machine.name).toLowerCase();
    const prefix = shopPrefix.value.toLowerCase();
    
    // Log each machine name for debugging
    console.log(`Checking machine: "${machine.name}" for prefix "${shopPrefix.value}"`);
    
    return machineName.includes(prefix);
  });
});

// Format coordinates to a readable string
const formatCoordinates = (x, y) => {
  return `${Math.round(x)}, ${Math.round(y)}`;
};

// Save shop prefix to localStorage
const saveShopPrefix = () => {
  localStorage.setItem('shopPrefix', shopPrefix.value);
  // Refresh the vending machines after changing the prefix
  refreshVendingMachines();
};

// Fetch all vending machines and analyze undercutting
const refreshVendingMachines = async () => {
  if (!isConnected.value || !shopPrefix.value) return;
  
  isLoading.value = true;
  vendingMachines.value = [];
  allVendingMachines.value = [];
  
  try {
    // Fetch map markers from the server
    const response = await axios.get('/api/rustplus/mapMarkers');
    
    if (response.data.success && response.data.data) {
      console.log('Full API response:', response.data);
      const markers = response.data.data.markers || [];
      console.log(`Found ${markers.length} total markers on the map`);
      
      // Log marker types for debugging
      const markerTypes = {};
      markers.forEach(marker => {
        markerTypes[marker.type] = (markerTypes[marker.type] || 0) + 1;
      });
      console.log('Marker types distribution:', markerTypes);
      
      // Filter for vending machines
      const vendingMachineMarkers = markers.filter(marker => 
        marker.type === 3 || marker.type === "3" || marker.type === "VendingMachine"  // Accept both formats
      );
      console.log(`Found ${vendingMachineMarkers.length} vending machine markers`);
      
      if (vendingMachineMarkers.length === 0) {
        console.log('First 3 markers for debugging:', markers.slice(0, 3));
      }
      
      // Store all vending machines for debugging
      allVendingMachines.value = vendingMachineMarkers;
      
      // Process each vending machine to check for undercutting
      const processedMachines = vendingMachineMarkers.map(machine => {
        // Process the sell orders for each machine
        const sellOrders = (machine.sellOrders || []).map(order => {
          // Find competing offers from other vending machines
          const competitors = vendingMachineMarkers
            .filter(otherMachine => 
              // Not our machine and is selling the same item
              otherMachine.id !== machine.id && 
              otherMachine.sellOrders?.some(otherOrder => 
                otherOrder.itemId === order.itemId &&
                otherOrder.itemIsBlueprint === order.itemIsBlueprint &&
                otherOrder.currencyId === order.currencyId &&
                otherOrder.currencyIsBlueprint === order.currencyIsBlueprint
              )
            )
            .flatMap(otherMachine => {
              // Get the competing orders from this machine
              const matchingOrders = otherMachine.sellOrders.filter(otherOrder => 
                otherOrder.itemId === order.itemId &&
                otherOrder.itemIsBlueprint === order.itemIsBlueprint &&
                otherOrder.currencyId === order.currencyId &&
                otherOrder.currencyIsBlueprint === order.currencyIsBlueprint
              );
              
              return matchingOrders.map(matchingOrder => ({
                shopName: otherMachine.name,
                quantity: matchingOrder.quantity,
                price: matchingOrder.costPerItem,
                location: { x: otherMachine.x, y: otherMachine.y },
                isUndercutting: matchingOrder.costPerItem < order.costPerItem
              }));
            });

          // Find the lowest price among competitors
          const lowestCompetitorPrice = competitors.length > 0
            ? Math.min(...competitors.map(c => c.price))
            : null;
          
          // Calculate by how much we're being undercut
          const undercutBy = lowestCompetitorPrice !== null && lowestCompetitorPrice < order.costPerItem
            ? order.costPerItem - lowestCompetitorPrice
            : null;
          
          return {
            ...order,
            itemName: getItemName(order.itemId),
            currencyName: getItemName(order.currencyId),
            competitors,
            undercutBy
          };
        });
        
        return {
          ...machine,
          sellOrders
        };
      });
      
      vendingMachines.value = processedMachines;
    } else {
      console.error('Failed to fetch map markers:', response.data.error);
    }
  } catch (error) {
    console.error('Error refreshing vending machines:', error);
  } finally {
    isLoading.value = false;
  }
};

// Helper function to get item name from ID (placeholder - you'd need a real item database)
const getItemName = (itemId) => {
  // This would be replaced with a lookup to a real item database
  const itemNames = {
    // Some common items as examples
    1: 'Stone',
    2: 'Wood',
    3: 'Metal Fragments',
    4: 'High Quality Metal',
    5: 'Scrap',
    // Add more items as needed
  };
  
  return itemNames[itemId] || null;
};

// Watch for Rust+ connection status changes
watch(() => rustplusStatus.value.connected, (newValue) => {
  isConnected.value = newValue;
  
  if (newValue && shopPrefix.value) {
    refreshVendingMachines();
  }
});

// Setup socket listeners and initial data
onMounted(async () => {
  // Load shop prefix from localStorage
  const savedPrefix = localStorage.getItem('shopPrefix');
  if (savedPrefix) {
    shopPrefix.value = savedPrefix;
  }
  
  // Set up socket listeners for RustPlus status updates
  socket.on('rustplusStatus', (status) => {
    rustplusStatus.value = status;
    isConnected.value = status.connected;
  });
  
  // Listen for map marker updates
  socket.on('mapMarkersUpdated', () => {
    if (isConnected.value && shopPrefix.value) {
      refreshVendingMachines();
    }
  });
  
  // Get initial RustPlus status
  try {
    const response = await axios.get('/api/rustplus/status');
    if (response.data.success) {
      rustplusStatus.value = response.data.data;
      isConnected.value = response.data.data.connected;
      
      // If connected and shop prefix is set, load vending machines
      if (isConnected.value && shopPrefix.value) {
        refreshVendingMachines();
      }
    }
  } catch (error) {
    console.error('Failed to get RustPlus status:', error);
  }
});

// Log when response comes back to help debug
watch(allVendingMachines, (newValue) => {
  console.log(`allVendingMachines updated: ${newValue.length} machines found`);
  console.log(`Shop prefix: "${shopPrefix.value}"`);
  if (newValue.length > 0) {
    console.log('Example vending machine names:');
    newValue.slice(0, 5).forEach(machine => {
      console.log(` - "${machine.name}"`);
    });
  }
});
</script>

<style scoped>
.undercutter-container {
  padding: 16px;
}

/* Skeleton loading styles */
.skeleton-title {
  height: 24px;
  width: 70%;
  margin-bottom: 8px;
}

.skeleton-subtitle {
  height: 16px;
  width: 40%;
}

.skeleton-icon {
  height: 36px;
  width: 36px;
  border-radius: 50%;
}

.skeleton-text {
  height: 16px;
  border-radius: 4px;
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    opacity: 0.6;
  }
}

.vending-machine-card {
  transition: all 0.2s ease;
}

.vending-machine-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.sell-order {
  padding: 8px;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.03);
}

.competitor-item {
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
}

.competitor-item:last-child {
  border-bottom: none;
}
</style>
  