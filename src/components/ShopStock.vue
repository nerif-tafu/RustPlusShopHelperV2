<template>
    <div class="shopsearch-container">
      <div class="description-box" :style="getBoxStyle()">
        <h2 :style="getTitleStyle()">Stock monitoring</h2> <!-- Title with bold weight and text color -->
        <p :style="getNormalTextStyle()">
          This page allows you to keep track of the amount of items you have left in your shops. It will notify you when you run out of an item. You can configure how this functions in the settings menu.
        </p>
        
        <div class="search-filters">
          <div>
            <h3 :style="getNormalTextStyle()">Buy For</h3>
            <v-text-field
              class="pt-3"
              v-model="searchBuy"
              :placeholder="searchBuy ? '' : 'Any item...'"
              :append-inner-icon="searchBuy ? 'mdi-close' : 'mdi-magnify'"
              @click:append-inner="searchBuy ? (searchBuy = '') : null"
              :style="getInputStyle()"
            />
          </div>
          <div>
            <h3 :style="getTitleStyle()">Sell For</h3>
            <v-text-field
              class="pt-3"
              v-model="searchSell"
              :placeholder="searchBuy ? '' : 'Any item...'"
              :append-inner-icon="searchSell ? 'mdi-close' : 'mdi-magnify'"
              @click:append-inner="searchSell ? (searchSell = '') : null"
              :style="getInputStyle()"
            />
          </div>
        </div>
      </div>
      <div class="table-container" :style="getBoxStyle()">
        <v-data-table
          :headers="headers"
          :items="filteredItems"
          :style="getCellStyle()"
          class="styled-table"
        >
          <template v-slot:item.grid="{ item }">
            <a :href="'#/' + item.grid" class="grid-link" :style="{ color: themeColors.selected }">{{ item.grid }}</a>
          </template>
          <template v-slot:item.sellingAmount="{ item }">
            <div class="image-container">
              <img :src="item.sellingImage" alt="Selling item" class="item-image" />
              <span class="item-amount">x{{ item.sellingAmount }}</span>
            </div>
          </template>
          <template v-slot:item.costAmount="{ item }">
            <div class="image-container" >
              <img :src="item.costImage" alt="Cost item" class="item-image" />
              <span class="item-amount">x{{ item.costAmount }}</span>
            </div>
          </template>
          <template #bottom></template>
        </v-data-table>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue';
  import { useTheme } from 'vuetify/lib/framework.mjs';
  
  const items = ref([
    {
      shopName: 'Resource Exchange',
      grid: 'G15',
      sellingImage: '/images/item1.png',
      sellingAmount: 1000,
      sellingName: 'Incendiary 5.56 Rifle Ammo',
      costImage: '/images/item2.png',
      costAmount: 20,
      costName: '12 Gauge Incendiary Shell',
      stock: 15,
    },
    {
      shopName: "Greg's Shop",
      grid: 'AB4',
      sellingImage: '/images/item3.png',
      sellingAmount: 35,
      sellingName: 'Basic Wood Tea',
      costImage: '/images/item4.png',
      costAmount: 19,
      costName: 'Sulfur',
      stock: 150,
    },
    {
      shopName: 'Island Oasis',
      grid: 'A5',
      sellingImage: '/images/item5.png',
      sellingName: 'Gun Powder',
      sellingAmount: 600,
      costImage: '/images/item6.png',
      costAmount: 4,
      costName: 'Charcoal',
      stock: 48,
    },
    {
      shopName: 'Island Oasis',
      grid: 'A5',
      sellingImage: '/images/item5.png',
      sellingName: 'Gun Powder',
      sellingAmount: 600,
      costImage: '/images/item4.png',
      costAmount: 19,
      costName: 'Sulfur',
      stock: 20,
    },
  ]);
  const theme = useTheme();
  const themeColors = theme.themes.value.customTheme.colors;
  const searchBuy = ref('');
  const searchSell = ref('');
  
  const headers = computed(() => [
    { title: 'Shop Name', align: 'start', value: 'shopName'},
    { title: 'Grid', value: 'grid' },
    { title: 'Selling', value: 'sellingAmount', sortable: true },
    { title: 'Cost', value: 'costAmount', sortable: true },
    { title: 'Stock', value: 'stock', sortable: true }
  ]);
  
  const getBoxStyle = () => ({
    backgroundColor: themeColors['container'],
    padding: '16px',
    marginBottom: '16px',
  });
  
  const getTitleStyle = () => ({
    color: themeColors['text'],
    fontWeight: 'bold',
  });
  
  const getCellStyle = () => ({
    backgroundColor: themeColors['cell-bg'],
    color: themeColors['text'],
  });
  
  const getInputStyle = () => ({
    color: themeColors['text'],
    borderRadius: '0px',
    padding: '0px',
    width: '100%',
    margin: '0px'
  });

  // Function to get the styles for normal text
  const getNormalTextStyle = () => {
    return {
      color: themeColors['text'], // Use the 'text' color for normal text
    };
  };
  
  const filteredItems = computed(() => items.value.filter((item) => item.sellingName.toLowerCase().includes(searchBuy.value.toLowerCase()) && item.costName.toLowerCase().includes(searchSell.value.toLowerCase())));
  </script>
  
  
  <style scoped>
  .shopsearch-container {
    padding: 16px;
  }
  
  .table-container {
    overflow-x: auto;
  }
  
  .styled-table {
    background-color: transparent; /* Adjust as needed */
    border: none;
  }
  
  .image-container {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 40px;
  }
  
  .item-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  
  .item-amount {
    position: absolute;
    bottom: -8px;
    right: -8px;
    padding: 2px 4px;
    font-weight: bold;
    font-size: 12px;
    border-radius: 2px;
  }
  
  .search-filters {
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  
  .search-filters > div {
    flex: 1;
    margin-right: 16px;
  }
  
  .search-filters > div:last-child {
    margin-right: 0;
  }
  
  .grid-link {
    text-decoration: none;
  }
  </style>
  