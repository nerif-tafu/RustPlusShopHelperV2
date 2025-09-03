const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const axios = require('axios');

// Constants for asset management
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'itemDatabase.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

// Cache for the database
let itemDatabaseCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Helper function to send progress updates to the client
 */
function updateProgress(io, progress, message) {
  const socketIo = io || global.io;
  
  if (!socketIo) {
    return;
  }
  
  socketIo.emit('itemDatabaseProgress', { progress, message });
}

/**
 * Ensure all required directories exist
 */
function ensureDirectoriesExist() {
  const dirsToCreate = [DATA_DIR, IMAGES_DIR];
  dirsToCreate.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Download file from URL
 */
async function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    
    // Determine if we should use http or https based on the URL protocol
    const http = require('http');
    const https = require('https');
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    
    // Set timeout for the request
    const timeout = 60000; // 60 second timeout for downloads
    
    const request = client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete the file async
        reject(err);
      });
    });
    
    // Set timeout
    request.setTimeout(timeout, () => {
      request.destroy();
      fs.unlink(filePath, () => {}); // Clean up the file
      reject(new Error(`Download timeout after ${timeout/1000} seconds`));
    });
    
    request.on('error', (err) => {
      fs.unlink(filePath, () => {}); // Clean up the file
      reject(err);
    });
  });
}

/**
 * Fetch items from the Rust API
 */
async function fetchItemsFromAPI() {
  try {
    const response = await axios.get('https://rust-api.tafu.casa/api/items?limit=10000&offset=0', {
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'RustPlusShopHelper/1.0'
      }
    });
    
    if (!response.data || !response.data.items) {
      throw new Error('Invalid response from Rust API');
    }
    
    const items = response.data.items;
    
    // Transform the API response to match our expected format
    const transformedItems = {};
    items.forEach(item => {
      if (item.shortname) {
        transformedItems[item.shortname] = {
          id: item.shortname,
          name: item.displayName || item.shortname,
          description: '', // API doesn't provide descriptions
          category: item.categoryName || 'Unknown',
          numericId: item.itemid || 0,
          shortname: item.shortname,
          image: `/api/items/images/${item.shortname}.png`,
          lastUpdated: new Date().toISOString(),
          // Additional fields from API
          stackable: item.stackable || 1,
          volume: item.volume || 0,
          craftTime: item.craftTime || 0,
          amountToCreate: item.amountToCreate || 1,
          workbenchLevelRequired: item.workbenchLevelRequired || 0,
          ingredients: item.ingredients || []
        };
      }
    });
    
    return transformedItems;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request to Rust API timed out. Please try again.');
    } else if (error.response) {
      throw new Error(`Rust API error: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      throw new Error('Unable to reach Rust API. Please check your internet connection.');
    } else {
      throw new Error(`Error fetching items: ${error.message}`);
    }
  }
}

/**
 * Download all item images
 */
async function downloadAllImages(io) {
  try {
    updateProgress(io, 40, 'Downloading item images...');
    
    // Download the zip file
    const zipUrl = 'https://rust-api.tafu.casa/api/images/download-all';
    const zipPath = path.join(DATA_DIR, 'images.zip');
    
    await downloadFile(zipUrl, zipPath);
    
    // Extract the zip file
    updateProgress(io, 70, 'Extracting images...');
    
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(IMAGES_DIR, true);
    
    // Clean up the zip file
    fs.unlinkSync(zipPath);
    
    updateProgress(io, 90, 'Images download complete');
    
    return true;
  } catch (error) {
    console.error('Error downloading images:', error);
    throw error;
  }
}

/**
 * Load the item database
 */
async function loadDatabase() {
  try {
    ensureDirectoriesExist();
    
    // Check if we have a recent cache
    if (itemDatabaseCache && (Date.now() - lastCacheTime) < CACHE_DURATION) {
      return itemDatabaseCache;
    }
    
    // Check if database file exists and is recent
    if (fs.existsSync(DATABASE_PATH)) {
      const stats = fs.statSync(DATABASE_PATH);
      const fileAge = Date.now() - stats.mtime.getTime();
      
      if (fileAge < CACHE_DURATION) {
        const data = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf8'));
        itemDatabaseCache = data.items || {};
        lastCacheTime = stats.mtime.getTime();
        return itemDatabaseCache;
      }
    }
    
    // Fetch fresh data from API
    const items = await fetchItemsFromAPI();
    
    // Save to database file
    const databaseData = {
      metadata: {
        itemCount: Object.keys(items).length,
        lastUpdated: new Date().toISOString(),
        source: 'rust-api.tafu.casa'
      },
      items
    };
    
    fs.writeFileSync(DATABASE_PATH, JSON.stringify(databaseData, null, 2));
    
    itemDatabaseCache = items;
    lastCacheTime = Date.now();
    
    return items;
  } catch (error) {
    console.error('Error loading database:', error);
    throw error;
  }
}

/**
 * Get item by ID
 */
function getItemById(id) {
  if (!itemDatabaseCache) {
    console.log('Database cache is null, attempting to load database...');
    try {
      // Try to load the database synchronously
      const data = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf8'));
      itemDatabaseCache = data.items || {};
      lastCacheTime = Date.now();
      console.log('Database loaded synchronously, cache size:', Object.keys(itemDatabaseCache).length);
    } catch (error) {
      console.error('Failed to load database synchronously:', error);
      throw new Error('Database not loaded. Call loadDatabase() first.');
    }
  }
  
  // Try to find by shortname first
  if (itemDatabaseCache[id]) {
    return itemDatabaseCache[id];
  }
  
  // Try to find by numeric ID
  for (const key in itemDatabaseCache) {
    if (itemDatabaseCache[key].numericId === parseInt(id)) {
      return itemDatabaseCache[key];
    }
  }
  
  return null;
}

/**
 * Get item by numeric ID (for Rust+ API compatibility)
 */
function getItemByNumericId(numericId) {
  if (!itemDatabaseCache) {
    console.log('Database cache is null, attempting to load database...');
    try {
      // Try to load the database synchronously
      const data = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf8'));
      itemDatabaseCache = data.items || {};
      lastCacheTime = Date.now();
      console.log('Database loaded synchronously, cache size:', Object.keys(itemDatabaseCache).length);
    } catch (error) {
      console.error('Failed to load database synchronously:', error);
      throw new Error('Database not loaded. Call loadDatabase() first.');
    }
  }
  
  for (const key in itemDatabaseCache) {
    if (itemDatabaseCache[key].numericId === parseInt(numericId)) {
      return itemDatabaseCache[key];
    }
  }
  
  return null;
}

/**
 * Get all items
 */
function getAllItems() {
  if (!itemDatabaseCache) {
    throw new Error('Database not loaded. Call loadDatabase() first.');
  }
  return itemDatabaseCache;
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
  try {
    const items = await loadDatabase();
    return {
      itemCount: Object.keys(items).length,
      lastUpdated: new Date().toISOString(),
      source: 'rust-api.tafu.casa'
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw error;
  }
}

/**
 * Clear all existing images and database
 */
async function clearExistingData() {
  try {
    // Clear the database file if it exists
    if (fs.existsSync(DATABASE_PATH)) {
      fs.unlinkSync(DATABASE_PATH);
    }
    
    // Clear the images directory if it exists
    if (fs.existsSync(IMAGES_DIR)) {
      const files = fs.readdirSync(IMAGES_DIR);
      for (const file of files) {
        const filePath = path.join(IMAGES_DIR, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }
    
    // Clear cache
    itemDatabaseCache = null;
    lastCacheTime = 0;
  } catch (error) {
    console.error('Error clearing existing data:', error);
    throw error;
  }
}

/**
 * Update the item database
 */
async function updateItemDatabase(io) {
  try {
    updateProgress(io, 0, 'Starting update...');
    
    // Clear all existing data first
    updateProgress(io, 5, 'Clearing existing data...');
    await clearExistingData();
    
    // Load fresh data
    updateProgress(io, 20, 'Fetching item data...');
    await loadDatabase();
    
    // Download images
    await downloadAllImages(io);
    
    // Final progress update
    updateProgress(io, 100, 'Database update complete!');
    
    return { success: true, message: 'Database updated successfully' };
  } catch (error) {
    console.error('Error updating item database:', error);
    throw error;
  }
}

/**
 * Serve item images
 */
function serveItemImages(app) {
  app.use('/api/items/images', express.static(IMAGES_DIR));
}

module.exports = {
  // Database functions
  loadDatabase,
  getItemById,
  getItemByNumericId,
  getAllItems,
  getDatabaseStats,
  updateItemDatabase,
  serveItemImages,
  
  // Constants
  IMAGES_DIR,
  DATABASE_PATH
}; 