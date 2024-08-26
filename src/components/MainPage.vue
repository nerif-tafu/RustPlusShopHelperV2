<template>
  <v-app>
    <v-app-bar app :color="themeColors['container-light-bg']" class="navbar pr-2">
      <div class="navbar-content">
        <v-btn-toggle v-model="selectedButton" mandatory rounded class="px-2">
          <v-btn
            value="undercutter"
            class="navbar-btn mx-1"
            :style="getButtonStyle('undercutter')"
          >
            <v-icon left class="pr-2">mdi-content-cut</v-icon>Undercutter
          </v-btn>
          <v-btn
            value="stock"
            class="navbar-btn mx-1"
            :style="getButtonStyle('stock')"
          >
            <v-icon left class="pr-2">mdi-store</v-icon>Shop Stock
          </v-btn>
          <v-btn
            value="search"
            class="navbar-btn mx-1"
            :style="getButtonStyle('search')"
          >
            <v-icon left class="pr-2">mdi-magnify</v-icon>Shop Search
          </v-btn>
        </v-btn-toggle>
        <div class="spacer"></div>
        <v-btn
          class="navbar-btn mx-1"
          :style="getButtonStyle('settings')"
          @click="selectSettings"
        >
          <v-icon left class="pr-2">mdi-cog</v-icon>Settings
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Conditionally render the components based on the selected button -->
    <div class="content-wrapper">
      <div class="main-content">
        <Undercutter v-if="selectedButton === 'undercutter'" />
        <ShopStock v-if="selectedButton === 'stock'" />
        <ShopSearch v-if="selectedButton === 'search'" />
        <Settings v-if="selectedButton === 'settings'" />
      </div>
    </div>
  </v-app>
</template>

<script setup>
import { ref } from 'vue';
import { useTheme } from 'vuetify/lib/framework.mjs'; // Import useTheme to access the theme

// Import the components
import Undercutter from './Undercutter.vue';
import ShopStock from './ShopStock.vue';
import ShopSearch from './ShopSearch.vue';
import Settings from './Settings.vue';

const selectedButton = ref('undercutter');

// Access the current theme colors
const theme = useTheme();
const themeColors = theme.themes.value.customTheme.colors;

const getButtonStyle = (button) => {
  return {
    backgroundColor: themeColors['navbar-btn'],
    color: themeColors['text'],
    border: `1px solid ${selectedButton.value === button ? themeColors['selected'] : 'transparent'}`,
    borderRadius: button === 'settings' ? '0px' : '8px', // Square border for Settings
    height: '48px', // Set a consistent height
    lineHeight: '32px', // Align icon and text vertically
    boxSizing: 'border-box', // Ensure padding and border are included in the height
  };
};

// Function to handle settings button click
const selectSettings = () => {
  selectedButton.value = 'settings'; // Set selected button to settings
};
</script>

<style scoped>
.navbar {
  background-color: var(--v-theme-container-light-bg);
}

.navbar-content {
  display: flex;
  width: 100%;
  align-items: center;
}

.navbar-btn {
  min-width: 120px;
  padding: 8px 30px;
  text-transform: none;
  height: 48px; /* Ensure consistent height */
  line-height: 32px; /* Ensure vertical alignment of text and icon */
  box-sizing: border-box; /* Include padding and border in height calculation */
}

.spacer {
  flex-grow: 1;
}

.content-wrapper {
  width: 70%; /* Set the max-width to a typical website content width */
  margin: 0 auto; /* Center the content horizontally */
  padding: 16px;
  padding-top: 64px; /* Adjust this to match the height of your navbar */
  background-color: var(--v-theme-bg-color); /* Adjust this as per your theme */
}

.main-content {
  background-color: var(--v-theme-bg-color); /* Adjust this as per your theme */
}
</style>
