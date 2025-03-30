/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Plugins
import vuetify from './plugins/vuetify'
import router from './router'
import axios from 'axios'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

const app = createApp(App)

app.use(vuetify)
app.use(router)

app.mount('#app')
