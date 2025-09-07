<template>
  <v-dialog v-model="internalVisible" max-width="1200px">
    <v-card class="map-modal">
      <v-card-title class="map-modal-title">
        <span>Map View</span>
        <v-btn icon @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="map-modal-content">
        <div v-if="isLoadingMap" class="map-loading">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
          <span>Loading map...</span>
        </div>

        <div v-else-if="mapData" class="map-container">
          <div v-if="mapData.image" class="map-image-wrapper">
            <div v-if="shop" class="shop-location-info">
              <strong>{{ shop.shopName }}</strong>
              <div>Coords: ({{ shop.x?.toFixed(0) }}, {{ shop.y?.toFixed(0) }})</div>
              <div v-if="mapData?.gridConfig">Grid: {{ getGridLabel(shop) }}</div>
            </div>

            <div 
              ref="mapContentRef"
              class="map-content"
              :style="getMapTransformStyle()"
              @wheel.prevent="onMapWheel"
              @mousedown="onMapMouseDown"
            >
              <img 
                ref="mapImageRef"
                :src="mapData.image" 
                alt="Rust Map" 
                class="map-image"
                draggable="false"
                @dragstart.prevent
                @load="onMapImageLoad"
              />
              <canvas ref="gridCanvasRef" class="grid-canvas"></canvas>

              <div v-if="shop && mapImageSize.width" class="shop-marker" :style="getMarkerPosition(shop)">
                <v-icon color="red" :size="getMarkerIconSize()">mdi-map-marker</v-icon>
                <span class="marker-label" :style="getMarkerLabelStyle()">{{ shop.shopName }}</span>
              </div>
            </div>

            <div class="zoom-controls">
              <v-btn icon size="small" @click="zoomIn"><v-icon>mdi-plus</v-icon></v-btn>
              <v-btn icon size="small" @click="zoomOut"><v-icon>mdi-minus</v-icon></v-btn>
              <v-btn icon size="small" @click="resetZoom"><v-icon>mdi-refresh</v-icon></v-btn>
            </div>
          </div>
          <div v-else class="map-data-info">
            <p>Map data received but no image found.</p>
            <p>Map data structure: {{ JSON.stringify(mapData, null, 2) }}</p>
          </div>
        </div>

        <div v-else class="map-error">
          <v-icon color="error" size="48">mdi-map-marker-off</v-icon>
          <span>Failed to load map data</span>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  shop: { type: Object, default: null }
});
const emit = defineEmits(['update:visible']);

const internalVisible = ref(props.visible);
watch(() => props.visible, v => { internalVisible.value = v; if (v) loadMapData(); });
watch(internalVisible, v => emit('update:visible', v));

const isLoadingMap = ref(false);
const mapData = ref(null);
const mapImageRef = ref(null);
const gridCanvasRef = ref(null);
const mapContentRef = ref(null);
const mapImageSize = ref({ width: 0, height: 0 });

const mapScale = ref(2);
const minScale = 0.5;
const maxScale = 4;
const translate = ref({ x: 0, y: 0 });
let isPanning = false;
let panStart = { x: 0, y: 0 };
let translateStart = { x: 0, y: 0 };

function close() { internalVisible.value = false; }

onMounted(() => {
  window.addEventListener('resize', handleResize);
});
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

const loadMapData = async () => {
  try {
    isLoadingMap.value = true;
    mapData.value = null;
    const response = await fetch('/api/rustplus/map');
    const result = await response.json();
    if (result.success) {
      mapData.value = result.data;
    }
  } finally {
    isLoadingMap.value = false;
  }
};

const onMapImageLoad = () => {
  if (mapImageRef.value) {
    mapImageSize.value = {
      width: mapImageRef.value.clientWidth,
      height: mapImageRef.value.clientHeight
    };
  }
  drawGridOverlay();
  centerOnSelectedShop();
};

const handleResize = () => {
  if (mapImageRef.value && internalVisible.value) {
    setTimeout(() => {
      onMapImageLoad();
      drawGridOverlay();
    }, 100);
  }
};

const getMapTransformStyle = () => ({
  transform: `translate(${translate.value.x}px, ${translate.value.y}px) scale(${mapScale.value})`,
  transformOrigin: '0 0'
});

const onMapWheel = (e) => {
  if (!mapContentRef.value) return;
  const rect = mapContentRef.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const oldScale = mapScale.value;
  const newScale = Math.min(maxScale, Math.max(minScale, oldScale * zoomFactor));
  if (newScale === oldScale) return;
  const k = newScale / oldScale;
  translate.value = {
    x: k * translate.value.x + (1 - k) * mouseX,
    y: k * translate.value.y + (1 - k) * mouseY
  };
  mapScale.value = newScale;
  drawGridOverlay();
};

const onMapMouseDown = (e) => {
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  translateStart = { ...translate.value };
  e.preventDefault();
  e.stopPropagation();
  window.addEventListener('mousemove', onMapMouseMove, { passive: false });
  window.addEventListener('mouseup', onMapMouseUp, { passive: false });
};
const onMapMouseMove = (e) => {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  translate.value = { x: translateStart.x + dx, y: translateStart.y + dy };
  drawGridOverlay();
};
const onMapMouseUp = () => {
  isPanning = false;
  window.removeEventListener('mousemove', onMapMouseMove);
  window.removeEventListener('mouseup', onMapMouseUp);
};

const zoomIn = () => { onMapWheel({ clientX: 0, clientY: 0, deltaY: -1, preventDefault() {}, currentTarget: mapContentRef.value }); };
const zoomOut = () => { onMapWheel({ clientX: 0, clientY: 0, deltaY: 1, preventDefault() {}, currentTarget: mapContentRef.value }); };
const resetZoom = () => { mapScale.value = 1; translate.value = { x: 0, y: 0 }; drawGridOverlay(); };

// Grid drawing and marker math (copied from ShopStock)
const drawGridOverlay = () => {
  if (!mapData.value || !gridCanvasRef.value || !mapImageSize.value.width) return;
  const canvas = gridCanvasRef.value;
  const ctx = canvas.getContext('2d');
  const mapWidth = mapData.value.width || 4096;
  const mapHeight = mapData.value.height || 4096;
  const oceanMargin = mapData.value.oceanMargin || 0;
  const gridCols = mapData.value.gridConfig?.gridCols || 32;
  const gridRows = mapData.value.gridConfig?.gridRows || 32;
  const displayWidth = mapImageSize.value.width;
  const displayHeight = mapImageSize.value.height;
  const dpr = window.devicePixelRatio || 1;
  const zoom = mapScale.value || 1;

  canvas.width = Math.floor(displayWidth * dpr * zoom);
  canvas.height = Math.floor(displayHeight * dpr * zoom);
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scaleX = displayWidth / mapWidth;
  const scaleY = displayHeight / mapHeight;
  const landOffsetX = oceanMargin * scaleX;
  const landOffsetY = oceanMargin * scaleY;
  const landWidthPx = (mapWidth - 2 * oceanMargin) * scaleX;
  const landHeightPx = (mapHeight - 2 * oceanMargin) * scaleY;
  const cellWidth = landWidthPx / gridCols;
  const cellHeight = landHeightPx / gridRows;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1 / dpr;
  for (let i = 0; i <= gridCols; i++) {
    const x = landOffsetX + i * cellWidth;
    ctx.beginPath(); ctx.moveTo(x, landOffsetY); ctx.lineTo(x, landOffsetY + landHeightPx); ctx.stroke();
  }
  for (let j = 0; j <= gridRows; j++) {
    const y = landOffsetY + j * cellHeight;
    ctx.beginPath(); ctx.moveTo(landOffsetX, y); ctx.lineTo(landOffsetX + landWidthPx, y); ctx.stroke();
  }

  const baseFontPx = 14;
  const fontPx = Math.max(4, baseFontPx / zoom);
  ctx.font = `bold ${fontPx}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let col = 0; col < gridCols; col++) {
    for (let row = 0; row < gridRows; row++) {
      let letter;
      if (col < 26) letter = String.fromCharCode(65 + col);
      else { const firstLetter = 'A'; const secondLetter = String.fromCharCode(65 + (col - 26)); letter = firstLetter + secondLetter; }
      const gridId = `${letter}${row}`;
      const labelX = landOffsetX + col * cellWidth + Math.max(1, 2 / zoom);
      const labelY = landOffsetY + row * cellHeight + Math.max(1, 2 / zoom);
      ctx.fillStyle = '#000000';
      ctx.fillText(gridId, labelX, labelY);
    }
  }
};

const getMarkerPosition = (shop) => {
  if (!mapData.value || !shop || !mapImageSize.value.width) return {};
  const mapWidth = mapData.value.width || 4096;
  const mapHeight = mapData.value.height || 4096;
  const oceanMargin = mapData.value.oceanMargin || 0;
  const worldSize = mapData.value?.gridConfig?.worldSize || mapData.value?.worldSize;
  if (!worldSize) return {};
  const displayWidth = mapImageSize.value.width;
  const displayHeight = mapImageSize.value.height;
  const scaleX = displayWidth / mapWidth;
  const scaleY = displayHeight / mapHeight;
  const landOffsetX = oceanMargin * scaleX;
  const landOffsetY = oceanMargin * scaleY;
  const landWidthPx = (mapWidth - 2 * oceanMargin) * scaleX;
  const landHeightPx = (mapHeight - 2 * oceanMargin) * scaleY;
  const x = landOffsetX + (shop.x / worldSize) * landWidthPx;
  const y = landOffsetY + ((worldSize - shop.y) / worldSize) * landHeightPx;
  return { position: 'absolute', left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)', zIndex: 1000 };
};

const getMarkerLabelStyle = () => {
  if (!mapImageSize.value.width) return {};
  const baseFontSize = 0.75;
  const baseMapWidth = 400;
  const scale = Math.max(0.7, Math.min(1.3, mapImageSize.value.width / baseMapWidth));
  return { fontSize: `${baseFontSize * scale}rem` };
};

const getMarkerIconSize = () => {
  if (!mapImageSize.value.width) return 24;
  const baseSize = 24; const baseMapWidth = 400; const scale = Math.max(0.7, Math.min(1.5, mapImageSize.value.width / baseMapWidth));
  return Math.round(baseSize * scale);
};

const getGridLabel = (shop) => {
  if (!shop || !mapData.value?.gridConfig) return 'N/A';
  const { gridDiameter, worldSize } = mapData.value.gridConfig;
  const first = convertNumberToLetter(shop.x / gridDiameter);
  const second = Math.floor((worldSize - shop.y) / gridDiameter);
  return `${first}${second}`;
};

const convertNumberToLetter = (num) => {
  const mod = num % 26;
  let pow = (num / 26) | 0;
  const out = mod ? String.fromCharCode(65 + mod) : (pow--, 'Z');
  return pow ? 'A' + out : out;
};

const centerOnSelectedShop = () => {
  if (!props.shop || !mapImageSize.value.width) return;
  const mapWidth = mapData.value.width || 4096;
  const mapHeight = mapData.value.height || 4096;
  const oceanMargin = mapData.value.oceanMargin || 0;
  const worldSize = mapData.value?.gridConfig?.worldSize || mapData.value?.worldSize;
  const displayWidth = mapImageSize.value.width;
  const displayHeight = mapImageSize.value.height;
  const scaleX = displayWidth / mapWidth;
  const scaleY = displayHeight / mapHeight;
  const landOffsetX = oceanMargin * scaleX;
  const landOffsetY = oceanMargin * scaleY;
  const landWidthPx = (mapWidth - 2 * oceanMargin) * scaleX;
  const landHeightPx = (mapHeight - 2 * oceanMargin) * scaleY;
  const x = landOffsetX + (props.shop.x / worldSize) * landWidthPx;
  const y = landOffsetY + ((worldSize - props.shop.y) / worldSize) * landHeightPx;
  translate.value = {
    x: displayWidth / 2 - x * mapScale.value,
    y: displayHeight / 2 - y * mapScale.value
  };
};
</script>

<style scoped>
.map-modal { background-color: #1A1D20; border: 1px solid #2C3034; border-radius: 8px; overflow: hidden; }
.map-modal-title { display: flex; justify-content: space-between; align-items: center; padding: 16px; background-color: #231E29; border-bottom: 1px solid #2C3034; color: #B1ADB3; font-size: 1.1rem; font-weight: 500; }
.map-modal-content { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.map-loading, .map-error { display: flex; flex-direction: column; align-items: center; gap: 12px; color: #9D7D99; font-size: 0.9rem; }
.map-container { position: relative; width: 100%; overflow: hidden; }
.map-image-wrapper { position: relative; width: 100%; }
.map-image { max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); user-select: none; -webkit-user-drag: none; }
.grid-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
.map-content { position: relative; width: 100%; height: 100%; will-change: transform; }
.shop-marker { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 1000; pointer-events: none; }
.marker-label { font-size: 0.75rem; font-weight: 600; color: white; background-color: rgba(0, 0, 0, 0.8); padding: 2px 6px; border-radius: 4px; white-space: normal; overflow: visible; text-overflow: clip; max-width: none; text-align: center; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.2); }
.zoom-controls { position: absolute; right: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 1002; }
.shop-location-info { position: absolute; top: 10px; left: 10px; background-color: rgba(0, 0, 0, 0.8); color: white; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; z-index: 10; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.2); }
</style>


