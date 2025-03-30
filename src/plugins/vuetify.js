import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import * as labs from 'vuetify/labs/components';
import { aliases, mdi } from 'vuetify/iconsets/mdi';

export default createVuetify({
  components: {
    ...components,
    ...labs
  },
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'customTheme',
    themes: {
      customTheme: {
        dark: false,
        colors: {
          background: '#151719',
          'container': '#1A1D20',
          'container-light-bg': '#1F2225',
          'navbar-btn': '#2C3034',
          'cell-bg': '#231E29',
          'link-color': '#9D7D99',
          'text': '#B1ADB3',
          'text-light': '#BFBFBF',
          'selected': '#A673B1',
        },
      },
    },
  },
});
