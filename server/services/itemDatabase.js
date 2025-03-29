const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { default: pLimit } = require('p-limit');
const express = require('express');

// Constants
const RUSTLABS_ITEM_LIST = 'https://wiki.rustclash.com/group=itemlist';
const RUSTLABS_URL = 'https://wiki.rustclash.com';
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'itemDatabase.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const CONCURRENT_REQUESTS = 3; // Reduced to prevent memory/performance issues
const IMAGE_CONCURRENCY = 15;

// Global queue for image downloads
let downloadImageQueue = [];

// Add metadata to track database status
let databaseMetadata = {
  lastUpdated: null,
  updating: false,
  itemCount: 0
};

// Browser pool for Puppeteer
let browserPool = [];
const MAX_BROWSERS = 1; // Adjust based on your server's resources
let browserInitializing = false;

// Cache for the database
let itemDatabaseCache = null;
let lastCacheTime = 0;

// Ensure directories exist
function ensureDirectoriesExist() {
  console.log('Ensuring data directories exist...');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    console.log(`Creating data directory: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log(`Creating images directory: ${IMAGES_DIR}`);
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  console.log('Directory check complete');
}

// Initialize or load existing database
function initializeDatabase() {
  if (fs.existsSync(DATABASE_PATH)) {
    console.log('Loading existing item database...');
    return JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf8'));
  }
  return { 
    lastUpdated: null,
    itemCount: 0,
    items: {}
  };
}

// Utility function to add delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch data with retries
async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 2000) {
  try {
    return await axios(url, options);
  } catch (error) {
    if (retries <= 1) throw error;
    
    console.log(`Request failed, retrying in ${delayMs/1000} seconds... (${retries-1} retries left)`);
    await delay(delayMs);
    return fetchWithRetry(url, options, retries - 1, delayMs * 1.5);
  }
}

// Fetch all item links from the main page
async function fetchItemLinks() {
  try {
    console.log('Fetching item list from RustLabs...');
    console.log('Launching headless browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      console.log(`Navigating to ${RUSTLABS_ITEM_LIST}...`);
      await page.goto(RUSTLABS_ITEM_LIST, { 
        waitUntil: 'networkidle2',
        timeout: 60000 // Give Cloudflare time to validate
      });
      
      // Wait extra time for Cloudflare to validate
      console.log('Waiting for Cloudflare validation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get page HTML after Cloudflare has approved
      const content = await page.content();
      const $ = cheerio.load(content);
      
      const links = [];
      
      // Target only the item links more precisely
      $('a.pad').each((_, element) => {
        links.push(RUSTLABS_URL + $(element).attr('href'));
      });
      
      console.log(`Found ${links.length} items to process`);
      
      // Save cookies for future requests
      const cookies = await page.cookies();
      fs.writeFileSync(
        path.join(__dirname, '..', 'data', 'cookies.json'), 
        JSON.stringify(cookies, null, 2)
      );
      
      return links;
    } finally {
      await browser.close();
      console.log('Browser closed');
    }
  } catch (error) {
    console.error('Error fetching item links:', error.message);
    if (error.response && error.response.status === 403) {
      console.error('The website is blocking our requests. This might be due to rate limiting or anti-scraping measures.');
    }
    throw error;
  }
}

// Process a single item page to extract data
async function processItemPage(url, database) {
  try {
    const itemId = url.split('/').pop();
    
    // Check if we already have this item and it's recent (less than 7 days old)
    if (database.items[itemId] && database.items[itemId].lastUpdated) {
      const lastUpdated = new Date(database.items[itemId].lastUpdated);
      const ageInDays = (Date.now() - lastUpdated) / (1000 * 60 * 60 * 24);
      if (ageInDays < 7) {
        return database.items[itemId]; // Use cached data
      }
    }
    
    // Fetch and process the item page
    console.log(`Processing item page: ${url}`);
    // Use a puppeteer browser instance from a pool
    const browser = await getBrowserFromPool();
    
    try {
      const page = await browser.newPage();
      
      // Load saved cookies if they exist
      const cookiesPath = path.join(__dirname, '..', 'data', 'cookies.json');
      if (fs.existsSync(cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        await page.setCookies(...cookies);
      }
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      console.log(`Navigating to item page: ${url}`);
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for Cloudflare validation if needed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get page HTML
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Extract item data with efficient selectors
      const identifierId = $('#right-column > div > table > tbody > tr:nth-child(1) > td:nth-child(2)').text().trim();
      const nameOfItem = $('#left-column > div.info-block > div.text-column > h1').text().trim();
      
      // Extract image URL
      const imageUrl = $('.icon-large').attr('src');
      let imagePath = null;
      
      if (imageUrl) {
        const imageFileName = `${identifierId}.png`;
        imagePath = `/images/${imageFileName}`;
        
        // Queue image download
        downloadImageQueue.push({
          url: RUSTLABS_URL + imageUrl,
          path: path.join(IMAGES_DIR, imageFileName)
        });
      }
      
      // Create item data object
      const itemData = {
        id: identifierId,
        name: nameOfItem,
        image: imagePath,
        url: url,
        lastUpdated: new Date().toISOString()
      };
      
      // Add optional data if available
      const description = $('.info-block > .text-column > div').text().trim();
      if (description) {
        itemData.description = description;
      }
      
      return itemData;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`Error processing item ${url}:`, error.message);
    // Return placeholder with error info for retry later
    return {
      url: url,
      error: error.message,
      lastUpdated: new Date().toISOString()
    };
  }
}

// Download a single image
async function downloadImage({ url, path }) {
  console.log(`Downloading image: ${url} -> ${path}`);
  // Skip if image already exists
  if (fs.existsSync(path)) {
    console.log(`Image already exists, skipping: ${path}`);
    return;
  }
  
  try {
    console.log(`Sending request for image: ${url}`);
    const response = await axios({
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://wiki.rustclash.com/',
        'Connection': 'keep-alive'
      },
      responseType: 'stream'
    });
    console.log(`Got image response for ${url}, writing to file`);
    
    const writer = fs.createWriteStream(path);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Image saved successfully: ${path}`);
        resolve();
      });
      writer.on('error', (err) => {
        console.error(`Error writing image: ${path}`, err);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error.stack);
  }
}

// Main function to update the item database
async function updateDatabase(io) {
  try {
    // Try to dynamically import the extract script to avoid circular dependencies
    const extractAssets = require('../scripts/extractRustAssets');
    
    // Notify clients that update is starting
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 5, 
        message: 'Starting database update...' 
      });
    }
    
    // Run the asset extraction process
    const result = await extractAssets.main(io);
    
    // Clear the cache to force a reload
    itemDatabaseCache = null;
    
    return result;
  } catch (error) {
    console.error('Database update failed:', error);
    
    // Notify clients of error
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 0, 
        message: `Update failed: ${error.message}` 
      });
    }
    
    return {
      success: false,
      message: `Error updating database: ${error.message}`
    };
  }
}

// Get item data by ID
function getItemById(id) {
  try {
    const database = loadDatabase();
    // Convert to string if it's a number
    const idStr = id.toString();
    
    // Try direct lookup first
    if (database.items[idStr]) {
      return database.items[idStr];
    }
    
    // If not found, try to find by numericId
    for (const key in database.items) {
      if (database.items[key].numericId === parseInt(idStr)) {
        return database.items[key];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting item by ID ${id}:`, error);
    return null;
  }
}

// Get item name by ID
function getItemNameById(id) {
  const item = getItemById(id);
  return item ? item.name : `Unknown Item (${id})`;
}

// Search items by name
function searchItems(query) {
  const database = loadDatabase();
  const results = [];
  const searchTerm = query.toLowerCase();
  
  Object.values(database.items).forEach(item => {
    if (item.name && item.name.toLowerCase().includes(searchTerm)) {
      results.push(item);
    }
  });
  
  return results;
}

// Express middleware to serve item images
function serveItemImages(app) {
  app.use('/images', express.static(IMAGES_DIR));
}

// Function to get database stats
async function getDatabaseStats() {
  const database = loadDatabase();
  return {
    itemCount: database.metadata?.itemCount || 0,
    lastUpdated: database.metadata?.lastUpdated || null
  };
}

// Function to fix invalid ID extraction
function extractItemIdFromUrl(url) {
  try {
    console.log(`Extracting ID from URL: ${url}`);
    // Extract the item name from URL path
    const urlPath = new URL(url).pathname;
    console.log(`URL path: ${urlPath}`);
    const itemPath = urlPath.split('/').filter(p => p.length > 0);
    console.log(`Item path parts:`, itemPath);
    
    if (itemPath.length >= 2 && itemPath[0] === 'item') {
      console.log(`Extracted item ID: ${itemPath[1]}`);
      return itemPath[1]; // This should be the item ID/slug
    }
    
    console.log('Could not extract ID, returning null');
    return null;
  } catch (error) {
    console.error('Error extracting item ID from URL:', error.stack, url);
    return null;
  }
}

// Fix the getItemDetails function to properly handle IDs
async function getItemDetails(url) {
  try {
    console.log(`Processing item: ${url}`);
    
    const id = extractItemIdFromUrl(url);
    if (!id) {
      console.warn(`Could not extract item ID from URL: ${url}`);
      return null;
    }
    
    console.log(`Fetching HTML for item: ${id}`);
    const response = await axios.get(url);
    console.log(`Received response for ${id}, status: ${response.status}`);
    const $ = cheerio.load(response.data);
    
    // Extract item name from h1
    const name = $('h1').text().trim();
    console.log(`Item name: ${name}`);
    
    // Get item image
    const imageUrl = $('.main-icon').attr('src');
    console.log(`Image URL: ${imageUrl}`);
    let imageData = null;
    
    if (imageUrl) {
      // Convert relative URL to absolute
      const absoluteImageUrl = new URL(imageUrl, RUSTLABS_URL).href;
      console.log(`Absolute image URL: ${absoluteImageUrl}`);
      
      // Get image filename from URL
      const imageFilename = path.basename(absoluteImageUrl);
      console.log(`Image filename: ${imageFilename}`);
      const imagePath = path.join(IMAGES_DIR, imageFilename);
      
      // Queue image for download
      console.log(`Queueing image for download: ${absoluteImageUrl} -> ${imagePath}`);
      downloadImageQueue.push({
        url: absoluteImageUrl,
        path: imagePath
      });
      
      imageData = {
        url: absoluteImageUrl,
        filename: imageFilename
      };
    }
    
    // Extract item description
    const description = $('p.description').text().trim();
    console.log(`Item description: ${description.substring(0, 50)}...`);
    
    // Create the item object
    const item = {
      id,
      name,
      url,
      description,
      image: imageData
    };
    
    console.log(`Item object created for ${id}`);
    return item;
  } catch (error) {
    console.error(`Error fetching item details from ${url}:`, error.stack);
    return null;
  }
}

// Process the image download queue
async function processImageQueue(io) {
  const limit = pLimit(IMAGE_CONCURRENCY);
  const totalImages = downloadImageQueue.length;
  console.log(`Starting to process image queue with ${totalImages} images`);
  let completedImages = 0;
  
  if (totalImages === 0) {
    console.log('No images to download');
    return;
  }
  
  console.log(`Processing ${totalImages} images`);
  
  const imagePromises = downloadImageQueue.map((imageData) => 
    limit(async () => {
      console.log(`Starting image download: ${imageData.url}`);
      await downloadImage(imageData);
      
      // Update progress
      completedImages++;
      if (io && completedImages % 10 === 0) {
        const progressPercent = Math.floor((completedImages / totalImages) * 10) + 85; // 85-95%
        console.log(`Image progress: ${completedImages}/${totalImages} (${progressPercent}%)`);
        io.emit('itemDatabaseProgress', { 
          progress: progressPercent, 
          message: `Downloaded ${completedImages} of ${totalImages} images` 
        });
      }
    })
  );
  
  console.log('Waiting for all image downloads to complete...');
  await Promise.all(imagePromises);
  console.log('All image downloads complete');
  
  // Clear the queue after processing
  console.log('Clearing image download queue');
  downloadImageQueue = [];
}

// Function to format date for display in frontend
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

// Function to get a browser from the pool
async function getBrowserFromPool() {
  // If browser pool is empty and not already initializing, create a new browser
  if (browserPool.length === 0 && !browserInitializing) {
    browserInitializing = true;
    console.log('Creating new browser instance');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    browserPool.push(browser);
    browserInitializing = false;
  } else if (browserPool.length === 0) {
    // Wait for the browser to be initialized
    console.log('Waiting for browser initialization...');
    while (browserPool.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return browserPool[0]; // Return the first browser in the pool
}

// Function to close the browser pool
async function closeBrowserPool() {
  console.log('Closing browser pool');
  for (const browser of browserPool) {
    await browser.close();
  }
  browserPool = [];
}

/**
 * Loads the item database from disk
 */
function loadDatabase() {
  try {
    // Check if cache is still valid (less than 5 minutes old)
    const now = Date.now();
    if (itemDatabaseCache && (now - lastCacheTime < 300000)) {
      return itemDatabaseCache;
    }

    // Load database from disk
    if (fs.existsSync(DATABASE_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf8'));
      itemDatabaseCache = data;
      lastCacheTime = now;
      return data;
    }
    
    // Database doesn't exist yet
    return { metadata: { itemCount: 0 }, items: {} };
  } catch (error) {
    console.error('Error loading item database:', error);
    return { metadata: { itemCount: 0 }, items: {} };
  }
}

// Add this function to return all items from the database
function getAllItems() {
  try {
    // Get the database file path
    const dbPath = path.join(__dirname, '..', 'data', 'itemDatabase.json');
    
    // Check if the database file exists
    if (!fs.existsSync(dbPath)) {
      console.warn('Item database file not found');
      return {};
    }
    
    // Read and parse the database file
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(dbContent);
    
    return db.items || {};
  } catch (error) {
    console.error('Error getting all items:', error);
    return {};
  }
}

module.exports = {
  loadDatabase,
  getItemById,
  getAllItems,
  getDatabaseStats,
  updateDatabase,
  serveItemImages
}; 