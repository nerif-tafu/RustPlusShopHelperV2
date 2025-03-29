<template>
  <v-app>
    <v-app-bar app :color="themeColors['container-light-bg']" class="navbar pr-2">
      <div class="navbar-content">
        <v-btn-toggle mandatory rounded class="px-2">
          <v-btn
            to="/shop/undercut"
            class="navbar-btn mx-1"
            :style="getButtonStyle(isActivePath('/shop/undercut'))"
          >
            <v-icon left class="pr-2">mdi-content-cut</v-icon>Undercutter
          </v-btn>
          <v-btn
            to="/shop/stock"
            class="navbar-btn mx-1"
            :style="getButtonStyle(isActivePath('/shop/stock'))"
          >
            <v-icon left class="pr-2">mdi-store</v-icon>Shop Stock
          </v-btn>
          <v-btn
            to="/shop/search"
            class="navbar-btn mx-1"
            :style="getButtonStyle(isActivePath('/shop/search'))"
          >
            <v-icon left class="pr-2">mdi-magnify</v-icon>Shop Search
          </v-btn>
        </v-btn-toggle>
        <div class="spacer"></div>
        <v-btn
          to="/settings"
          class="navbar-btn mx-1"
          :style="getButtonStyle(isActivePath('/settings'))"
        >
          <v-icon left class="pr-2">mdi-cog</v-icon>Settings
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Main content area with router view -->
    <div class="content-wrapper">
      <div class="main-content">
        <router-view />
      </div>
    </div>
  </v-app>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useTheme } from 'vuetify/lib/framework.mjs';

const route = useRoute();
const theme = useTheme();
const themeColors = theme.themes.value.customTheme.colors;

// Helper to check if the current route matches a given path pattern
const isActivePath = (path) => {
  return route.path.startsWith(path);
};

// Get button style based on whether it's active
const getButtonStyle = (isActive) => {
  return {
    textTransform: 'none',
    fontWeight: isActive ? '600' : '500',
    backgroundColor: isActive ? themeColors['selected'] : themeColors['navbar-btn'],
    color: isActive ? '#FFFFFF' : themeColors['text'],
  };
};
</script>

<style>
.navbar-content {
  display: flex;
  width: 100%;
  align-items: center;
}

.spacer {
  flex-grow: 1;
}

.content-wrapper {
  padding-top: 64px; /* Adjust based on app bar height */
  height: 100%;
  background-color: var(--v-theme-background);
}

.main-content {
  height: 100%;
  margin: 0 auto;
}

.navbar-btn {
  border-radius: 4px;
}
</style>
