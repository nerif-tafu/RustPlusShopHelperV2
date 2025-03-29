<!-- Settings.vue -->
<template>
  <v-container>
    <div class="settings-container">
      <!-- Description Box -->
      <div class="content-box">
        <h2 class="text-h5 mb-4">Server Connection Settings</h2>
        <p class="text-body-1 mb-4">
          To connect to your Rust server, you'll need to pair this application with your game. 
          Click "Pair with Server" below and follow the steps to complete the pairing process.
        </p>
        <v-btn
          color="primary"
          @click="startPairing"
          class="mt-4 navbar-btn"
        >
          <v-icon left class="pr-2">mdi-link-variant</v-icon>
          Pair with Server
        </v-btn>
      </div>

      <!-- Server Pairing Component -->
      <ServerPairing 
        v-model="showPairingDialog"
        @pairing-completed="onPairingCompleted"
        ref="pairingComponent"
      />
    </div>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';
import { useTheme } from 'vuetify/lib/framework.mjs';
import ServerPairing from './ServerPairing.vue';

const theme = useTheme();
const themeColors = theme.themes.value.customTheme.colors;

const showPairingDialog = ref(false);
const pairingComponent = ref(null);

function startPairing() {
  console.log('Starting pairing process...');
  if (pairingComponent.value) {
    pairingComponent.value.resetComponent();
  }
  showPairingDialog.value = true;
}

function onPairingCompleted(serverData) {
  console.log('Server pairing completed:', serverData);
  // You could update the UI with the server data if needed
}
</script>