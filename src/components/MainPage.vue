<template>
  <v-container class="fill-height">
    <v-responsive class="align-center text-center fill-height">
      <span>Hello World!</span>
    </v-responsive>
    <v-bottom-navigation>
      <v-btn value="settings">
        <v-icon @click="settingsMenu = true">mdi-cog</v-icon>
        <span>Settings</span>
      </v-btn>
    </v-bottom-navigation>
    <v-dialog
      v-model="settingsMenu"
      width="auto"
    >
      <v-card class="px-5 py-2">
        <!-- Could use info, success, and error -->
        <v-card-text class="text-h5">
          To connect to a server, fill out the form below
        </v-card-text>
        <v-card
        class="mt-3 mb-5"
        color="info"
        variant="tonal"
        
        >
        
          <v-card-text class="text-medium-emphasis text-caption">
            <v-progress-circular class="mr-3" indeterminate></v-progress-circular>
            <v-icon>mdi-check-circle</v-icon>
            Currently connecting to "Reddit EU Monthly"
          </v-card-text>
        </v-card>

        <v-text-field
          class="py-1"
          label="Server IP Address"
          required
          hide-details
        ></v-text-field>
        <v-text-field
          class="py-1"
          label="App port"
          required
          hide-details
        ></v-text-field>
        <v-text-field
          class="py-1"
          label="Player ID"
          required
          hide-details
        ></v-text-field>
        <v-text-field
          class="py-1"
          label="Player Token"
          required
          hide-details
        ></v-text-field>
       
        <v-btn
          class="mt-3"
          color="success"
          block
        >
          Submit
        </v-btn>
        <v-card-actions>
          <v-btn color="primary" block @click="settingsMenu = false">Close Settings</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
  import { ref } from 'vue'
  import { io } from "socket.io-client";
  
  const socket = io("http://localhost:3001");
  const settingsMenu = ref(true);

  socket.on("connect", () => {
    console.log('Client connected')
  });
</script>
