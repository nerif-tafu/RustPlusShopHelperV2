<!-- Settings.vue -->
<template>
  <v-container>
    <h2 class="mb-4">Server Connection Settings</h2>
    
    <v-btn
      color="primary"
      @click="startPairing"
      class="mt-4"
    >
      Pair with Server
    </v-btn>

    <v-dialog v-model="pairingDialog" max-width="600">
      <v-card>
        <v-card-title>Pair with Rust Server</v-card-title>
        <v-card-text>
          <v-stepper 
            v-model="activeStep"
            :items="steps"
          >
            <v-stepper-window>
              <v-stepper-window-item value="1">
                <h3>1. Login with Steam</h3>
                <ol>
                  <li>
                    <v-btn
                      color="primary"
                      class="mb-2"
                      @click="openSteamLogin"
                    >
                      Open Rust+ Login
                    </v-btn>
                  </li>
                  <li>Login with your Steam account</li>
                  <li>You'll be redirected to a welcome page</li>
                  <li>When you see "Welcome, [your username]", proceed to the next step</li>
                </ol>
                <v-btn
                  color="primary"
                  class="mt-4"
                  @click="goToNextStep"
                >
                  Next Step
                </v-btn>
              </v-stepper-window-item>

              <v-stepper-window-item value="2">
                <h3>2. Copy the Auth Data</h3>
                <ol>
                  <li>On the welcome page, right-click and select "View Page Source"</li>
                  <li>Press Ctrl+A to select all the HTML content</li>
                  <li>Press Ctrl+C to copy it</li>
                  <li>Click the "Paste HTML" button below</li>
                </ol>
                <v-btn
                  color="primary"
                  class="mt-4"
                  @click="promptForHTML"
                >
                  Paste HTML
                </v-btn>
              </v-stepper-window-item>

              <v-stepper-window-item value="3">
                <h3>3. Complete Pairing</h3>
                <ol>
                  <li>Open Rust</li>
                  <li>Press ESC</li>
                  <li>Click "Rust+" at the bottom</li>
                  <li>Click "Pair with Server"</li>
                </ol>
              </v-stepper-window-item>
            </v-stepper-window>
          </v-stepper>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showHTMLDialog" max-width="800">
      <v-card>
        <v-card-title>Paste HTML Content</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="htmlInput"
            label="Paste the HTML content here"
            rows="10"
            placeholder="Right-click the welcome page, select 'View Page Source', then copy and paste all the content here..."
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="error"
            @click="showHTMLDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            @click="processHTML"
            :disabled="!htmlInput"
          >
            Submit
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      timeout="3000"
    >
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useTheme } from 'vuetify/lib/framework.mjs';
import axios from 'axios';

const theme = useTheme();
const themeColors = theme.themes.value.customTheme.colors;

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

const pairingDialog = ref(false);
const activeStep = ref('1');
const showHTMLDialog = ref(false);
const htmlInput = ref('');

const steps = [
  {
    title: 'Login',
    value: '1',
  },
  {
    title: 'Copy',
    value: '2',
  },
  {
    title: 'Pair',
    value: '3',
  }
];

// Add this debug watcher
watch(activeStep, (newValue, oldValue) => {
  console.log(`Step changed from ${oldValue} to ${newValue}`);
});

const showSnackbar = (text, color) => {
  snackbar.value = {
    show: true,
    text,
    color
  };
};

async function processHTML() {
  if (!htmlInput.value) return;

  try {
    const match = htmlInput.value.match(/postMessage\('(.+?)'\)/);
    if (!match) throw new Error('Auth data not found in HTML');

    const jsonString = match[1].replace(/\\"/g, '"');
    const authData = JSON.parse(jsonString);
    
    showSnackbar('Starting registration process...', 'info');
    
    try {
      showHTMLDialog.value = false;
      activeStep.value = '3';
      
      showSnackbar('Waiting for game pairing...', 'info');
      const response = await axios.post('/api/pairing/register', {
        authToken: authData.Token
      });

      if (response.data.success) {
        showSnackbar('Successfully paired with Rust server!', 'success');
        console.log('Pairing data:', response.data);
      } else {
        throw new Error('Pairing failed');
      }
    } catch (error) {
      console.error('Registration failed:', error);
      activeStep.value = '2'; // Go back to copy step
      showSnackbar('Pairing failed - please try again', 'error');
    }
  } catch (error) {
    console.error('Failed to process HTML:', error);
    showSnackbar('Failed to extract auth data from HTML', 'error');
  }
}

function startPairing() {
  console.log('Starting pairing process...');
  activeStep.value = '1';
  pairingDialog.value = true;
}

function openSteamLogin() {
  const loginWindow = window.open('https://companion-rust.facepunch.com/login', '_blank', 'noopener,width=800,height=600');
  if (!loginWindow) {
    showSnackbar('Popup was blocked! Please enable popups and try again.', 'error');
  }
}

function promptForHTML() {
  showHTMLDialog.value = true;
}

function goToNextStep() {
  activeStep.value = String(Number(activeStep.value) + 1);
}
</script>

<style scoped>
.v-card {
  border-radius: 8px;
}
</style>
  