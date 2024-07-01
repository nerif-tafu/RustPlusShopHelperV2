<template>
  <v-app>
    <v-app-bar app>
      <v-btn-toggle v-model="selectedButton" mandatory class="pl-2">
        <v-btn value="undercutter" text class="mx-1">
          <v-icon left class="pr-2">mdi-content-cut</v-icon>Undercutter
        </v-btn>
        <v-btn value="stock" text class="mx-1">
          <v-icon left class="pr-2">mdi-store</v-icon>Shop Stock
        </v-btn>
        <v-btn value="search" text class="mx-1">
          <v-icon left class="pr-2">mdi-magnify</v-icon>Shop search
        </v-btn>
        <v-btn value="settings" text class="mx-1">
          <v-icon left class="pr-2">mdi-cog</v-icon>Settings
        </v-btn>
      </v-btn-toggle>
      <v-spacer></v-spacer>
      <v-divider vertical></v-divider>
      <v-chip color="red" class="ml-2">FCM Status</v-chip>
      <v-chip color="red" class="ml-2">Expo Status</v-chip>
      <v-chip color="red" class="mx-2">Rust+ Status</v-chip>
    </v-app-bar>
  </v-app>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue';
  import { VApp, VAppBar, VToolbarTitle, VSpacer, VBtnToggle, VBtn, VIcon, VDivider, VChip } from 'vuetify/components'

  const selectedButton = ref('search')
  import { io } from "socket.io-client";

  const newServerForm = ref({ serverIP: '', appPort: '', steamID: '', playerToken: '' });
  const socket = io("http://localhost:3001");

  socket.on("connect", () => {
    console.log('Client connected.')
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected.')
  });

  socket.on('svrRPConnect', (data) => {

  });

  socket.on('svrPingPong', (data) => {
    if ( !data.connectionStatus ) { return }
    const date = new Date(data.date);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
  });
</script>
