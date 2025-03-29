import { createRouter, createWebHistory } from 'vue-router';
import Undercutter from '@/components/Undercutter.vue';
import ShopStock from '@/components/ShopStock.vue';
import ShopSearch from '@/components/ShopSearch.vue';
import Settings from '@/components/Settings.vue';

const routes = [
  {
    path: '/',
    redirect: '/shop/undercut'
  },
  {
    path: '/shop/undercut',
    name: 'Undercutter',
    component: Undercutter
  },
  {
    path: '/shop/stock',
    name: 'ShopStock',
    component: ShopStock
  },
  {
    path: '/shop/search',
    name: 'ShopSearch',
    component: ShopSearch
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  },
  // Catch-all redirect to home
  {
    path: '/:catchAll(.*)',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router; 