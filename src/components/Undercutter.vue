<template>
    <div class="undercutter-container">
      <div class="description-box" :style="getBoxStyle()">
        <h2 :style="getTitleStyle()">Undercutting monitor</h2> <!-- Title with bold weight and text-light color -->
        <p :style="getNormalTextStyle()">
          Use this page to monitor if any other shops are selling at a lower price than you. Head to settings to initiate the configuration. Whenever an enemy shop updates their prices, this page will live update and provide a notification in the navigation bar.
        </p>
      </div>
      <div class="table-container" :style="getBoxStyle()">
        <table class="undercutter-table">
          <thead>
            <tr>
              <th :style="getTitleStyle()">Selling</th> <!-- Table headers with bold weight and text-light color -->
              <th :style="getTitleStyle()">Your Cost</th>
              <th :style="getTitleStyle()">Their Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in items" :key="index" :style="getCellStyle()">
              <td :style="getNormalTextStyle()">
                <div class="medium-image-container"> <!-- Adjusted for medium-sized image -->
                  <img :src="item.sellingImage" alt="Selling item" class="item-image-medium" />
                  <span class="item-amount" :style="getItemAmountStyle()">x15</span>
                </div>
              </td>
              <td :style="getNormalTextStyle()">
                <div class="image-container">
                  <img :src="item.yourCostImage" alt="Your cost" class="item-image" />
                  <span class="item-amount" :style="getItemAmountStyle()">x15</span>
                </div>
                <div>{{ item.yourShopName }}</div> <!-- Corrected syntax -->
              </td>
              <td :style="getNormalTextStyle()">
                <div class="image-container">
                  <img :src="item.theirCostImage" alt="Their cost" class="item-image" />
                  <span class="item-amount" :style="getItemAmountStyle()">x2</span>
                </div>
                <div>{{ item.theirShopName }}</div> <!-- Corrected syntax -->
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue';
  import { useTheme } from 'vuetify/lib/framework.mjs'; // Import useTheme to access the theme
  
  // Example items data
  const items = ref([
    {
      sellingImage: '/images/item1.png',
      yourCostImage: '/images/item3.png',
      theirCostImage: '/images/item3.png',
      yourShopName: 'HopShop | Resources',
      theirShopName: 'BEST SHOP | E2 ON TOP'
    },
    {
      sellingImage: '/images/item4.png',
      yourCostImage: '/images/item5.png',
      theirCostImage: '/images/item5.png',
      yourShopName: 'HopShop | Guns',
      theirShopName: 'Greg\'s House'
    },
    {
      sellingImage: '/images/item3.png',
      yourCostImage: '/images/item4.png',
      theirCostImage: '/images/item4.png',
      yourShopName: 'HopShop | Boom',
      theirShopName: 'Farmer Joe\'s Shop'
    },
    // Add more items as needed
  ]);
  
  // Access the current theme colors
  const theme = useTheme();
  const themeColors = theme.themes.value.customTheme.colors;
  
  // Function to get the styles for the description box
  const getBoxStyle = () => {
    return {
      backgroundColor: themeColors['container'], // Use the 'container' color
      padding: '16px',
      marginBottom: '16px',
    };
  };
  
  // Function to get the styles for the title and table headers
  const getTitleStyle = () => {
    return {
      color: themeColors['text-light'], // Use the 'text-light' color
      fontWeight: 'bold', // Make the title and headers bold
    };
  };
  
  // Function to get the styles for normal text
  const getNormalTextStyle = () => {
    return {
      color: themeColors['text'], // Use the 'text' color for normal text
    };
  };
  
  // Function to get the styles for table cells
  const getCellStyle = () => {
    return {
      backgroundColor: themeColors['cell-bg'], // Use the 'cell-bg' color
      padding: '12px',
      textAlign: 'left',
    };
  };
  
  // Function to get the styles for item amount text
  const getItemAmountStyle = () => {
    return {
      color: themeColors['text'], // Use the 'text' color for the item amount
    };
  };
  </script>
  
  <style scoped>
  .undercutter-container {
    padding: 16px;
  }
  
  .table-container {
    overflow-x: auto;
  }
  
  .undercutter-table {
    width: 100%;
    border-collapse: separate; /* Allow spacing between cells */
    border-spacing: 4px; /* Set the space between cells */
  }
  
  .undercutter-table th,
  .undercutter-table td {
    padding: px;
  }
  
  .undercutter-table th {
    text-align: center; /* Center-align text in headers */
  }
  
  .undercutter-table td {
    text-align: center; /* Center-align text in data cells */
  }
  
  .medium-image-container {
    position: relative;
    display: inline-block;
    width: 50px; /* Adjusted width */
    height: 50px; /* Adjusted height */
  }
  
  .item-image-medium {
    width: 100%;
    height: 100%;
    object-fit: contain;
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
    bottom: -8px; /* Move the text 15px down */
    right: -8px; /* Move the text 15px to the right */
    padding: 2px 4px;
    font-weight: bold;
    font-size: 12px;
    border-radius: 2px;
  }
  </style>
  