<template>
  <v-container class="fill-height">
    <v-responsive class="align-center text-center fill-height">
      <v-row justify="center">
        <v-col v-show="serverInfoForDom.color !== 'success'" cols="12" sm="6">
          <div class="pb-3"> {{ serverInfoForDom.text }} </div>
          <v-progress-linear v-show="serverInfoForDom.color === 'warning'" color="primary" indeterminate :height="6"></v-progress-linear>
        </v-col>
        <v-col v-show="serverInfoForDom.color === 'success'" cols="12" sm="6">
          <span>Hello world! 😊</span>
        </v-col>
      </v-row>
    </v-responsive>
    <v-bottom-navigation>
      <v-btn value="settings" @click="openSettings">
        <v-icon>mdi-cog</v-icon>
        <span>Settings</span>
      </v-btn>
      <v-btn >
        <v-icon>mdi-cloud-refresh</v-icon>
        <div :color="serverInfoForDom.color">Last response {{ lastServerPingPong.date }}</div>
      </v-btn>
    </v-bottom-navigation>
    <v-dialog v-model="settingsMenu" width="auto">
      <v-card class="px-5 py-2">
        <v-card-text class="text-h5">
          To connect to a server, fill out the form below
        </v-card-text>

        <v-card ref="serverInfoHolder" class="mt-3 mb-5" :color="serverInfoForDom.color" variant="tonal">
          <v-card-text ref="serverInfoText" class="text-medium-emphasis text-caption">
            <v-progress-circular v-if="lastServerStatus.connectionStatus === 'connecting'" class="mr-3" indeterminate></v-progress-circular>
            <v-icon v-if="lastServerStatus.connectionStatus === 'connected'">mdi-check-circle</v-icon>
            {{ serverInfoForDom.text }}
          </v-card-text>
        </v-card>

        <v-form @submit.prevent>
          <v-text-field v-model="newServerForm.serverIP" :rules="IPrules" class="py-1" label="Server IP Address" required hide-details="auto" ></v-text-field>
          <v-text-field v-model="newServerForm.appPort" :rules="portRules" class="py-1" label="App port" required hide-details="auto"></v-text-field>
          <v-text-field v-model="newServerForm.steamID" :rules="steam64Rules" class="py-1" label="Steam ID" required hide-details="auto"></v-text-field>
          <v-text-field v-model="newServerForm.playerToken" :rules="tokenRules" class="py-1" label="Player Token" required hide-details="auto"></v-text-field>

          <v-card-actions class="px-0 pt-0 pb-4">
            <v-btn @click="submitNewServer" type="submit" class="mt-3" color="success" variant="outlined" block>Submit</v-btn>
          </v-card-actions>
        </v-form>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue';
  import { io } from "socket.io-client";

  let lastServerPingPong = ref({ connectionStatus: false, date: '00:00'})
  let lastServerStatus = ref({ connectionStatus: 'disconnected', serverName: '' });
  const newServerForm = ref({ serverIP: '', appPort: '', steamID: '', playerToken: '' });
  const settingsMenu = ref(false);

  const socket = io("http://localhost:3001");

  const IPrules = [
    (value) => value ? true : 'You must enter an IP address.',
    (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(value) ? 
      true : 'Please enter a valid IP address format (e.g., 192.168.0.1).'
  ];

  const portRules = [
    (value) => value ? true : 'You must enter a port number.',
    (value) => /^\d+$/.test(value) ?
      (parseInt(value, 10) >= 1 && parseInt(value, 10) <= 65535 ?
        true : 'Please enter a port number between 1 and 65535.')
      : 'Please enter a valid port number (an integer between 1 and 65535).'
  ];

  const steam64Rules = [
    (value) => value ? true : 'You must enter a Steam64 ID.',
    (value) => /^\d{17}$/.test(value) ?
      true : 'Please enter a valid Steam64 ID (a 17-digit number).'
  ];

  const tokenRules = [
    (value) => value ? true : 'You must enter a player token.',
    (value) => /^-?\d{10}$/.test(value) ?
      true : 'Please enter a valid 10-digit player token.',
  ];

  const serverInfoForDom = computed(() => {
    switch (lastServerStatus.value.connectionStatus) {
      case 'disconnected':
        return {'color':'info', 'text':`Fill out the form to connect to a server`};
      case 'connecting':
        return {'color':'warning', 'text':`Connecting to ${lastServerStatus.value.serverName}`};
      case 'connected':
        return {'color':'success', 'text':`Connected to ${lastServerStatus.value.serverName}`};
      case 'error':
        return {'color':'error', 'text':`Disconnected from ${lastServerStatus.value.serverName}`};
    }
  });

  socket.on("connect", () => {
    console.log('Client connected.')
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected.')
  });

  socket.on('svrRPConnect', (data) => {
    lastServerStatus.value = data;
  });

  socket.on('svrPingPong', (data) => {
    if ( !data.connectionStatus ) { return }
    const date = new Date(data.date);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    lastServerPingPong.value = { 
      connectionStatus: data.connectionStatus,
      date: `${hours}:${minutes}:${seconds}`
    };
  });

  const submitNewServer = () => {
    socket.emit('clntNewServer', newServerForm.value);
  }

  const openSettings = () => {
    settingsMenu.value = true;
  };
</script>
