const fs = require('fs');
const path = require('path');
const RustPlus = require('@liamcottle/rustplus.js');
const socketInstance = require('../socketInstance');
const rustAssetManager = require('./RustAssetManager');

let rustplusInstance = null;
let connectionStatus = {
  connected: false,
  lastConnected: null,
  lastError: null,
  serverInfo: null,
  mapMarkers: null
};
let checkSubscriptionInterval = null;
const CHECK_INTERVAL = 10000; // Check every 10 seconds

/**
 * Initialize the RustPlus connection
 */
async function initializeRustPlus() {
  try {
    // Get server data from RPData.json
    const rpDataPath = path.join(__dirname, '..', 'RPData.json');
    
    if (!fs.existsSync(rpDataPath)) {
      throw new Error('No server paired yet');
    }
    
    const serverData = JSON.parse(fs.readFileSync(rpDataPath, 'utf8'));
    
    // Disconnect if already connected
    if (rustplusInstance) {
      rustplusInstance.disconnect();
      // Clear any existing interval
      if (checkSubscriptionInterval) {
        clearInterval(checkSubscriptionInterval);
        checkSubscriptionInterval = null;
      }
    }
    
    // Create a new RustPlus instance
    rustplusInstance = new RustPlus(
      serverData.serverIP, 
      serverData.appPort, 
      serverData.steamID, 
      serverData.playerToken
    );
    
    // Set up event listeners
    setupEventListeners();
    
    // Connect to the Rust server
    rustplusInstance.connect();
    
    return { success: true, message: 'RustPlus initialization started' };
  } catch (error) {
    console.error('Failed to initialize RustPlus:', error);
    
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    
    return { success: false, error: error.message };
  }
}

/**
 * Set up event listeners for the RustPlus instance
 */
function setupEventListeners() {
  if (!rustplusInstance) return;
  
  // Connection established
  rustplusInstance.on('connected', onConnected);
  
  // Connection closed
  rustplusInstance.on('disconnected', () => {
    console.log('Disconnected from Rust+ server');
    
    connectionStatus.connected = false;
    
    // Clear the check interval when disconnected
    if (checkSubscriptionInterval) {
      clearInterval(checkSubscriptionInterval);
      checkSubscriptionInterval = null;
    }
    
    // Emit connection status to clients
    const io = socketInstance.getIO();
    io.emit('rustplusStatus', getStatus());
  });
  
  // Error handling
  rustplusInstance.on('error', (error) => {
    console.error('RustPlus error:', error);
    
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    
    // Emit connection status to clients
    const io = socketInstance.getIO();
    io.emit('rustplusStatus', getStatus());
  });
  
  // Handle all messages
  rustplusInstance.on('message', (message) => {
    //console.log('Message from Rust+ server:', message);
    console.log('Message from Rust+')
    
    // Handle broadcast messages (entity changed, etc.)
    if (message.broadcast) {
      handleBroadcast(message.broadcast);
    }
  });
}

/**
 * Handle successful connection
 */
function onConnected() {
  console.log('Connected to Rust+ server');
  connectionStatus.connected = true;
  connectionStatus.lastConnected = new Date();
  
  // Emit connection status to clients
  const io = socketInstance.getIO();
  io.emit('rustplusStatus', getStatus());
  console.log('Emitted Rust+ connected status to clients');
  
  // Fetch map markers immediately after connecting
  console.log('Fetching initial map markers...');
  getMapMarkers()
    .then(markers => {
      console.log(`Initial map markers fetched: ${markers.markers.length} markers`);
    })
    .catch(err => {
      console.error('Error fetching initial map markers:', err);
    });
  
  // Setup automatic refresh of subscription status
  if (!checkSubscriptionInterval) {
    checkSubscriptionInterval = setInterval(() => {
      checkSubscription();
    }, CHECK_INTERVAL);
  }
}

/**
 * Start periodic subscription check to keep connection alive and detect disconnects
 */
function startSubscriptionCheck() {
  // Clear any existing interval first
  if (checkSubscriptionInterval) {
    clearInterval(checkSubscriptionInterval);
  }
  
  // Set up new interval for checking subscription
  checkSubscriptionInterval = setInterval(async () => {
    if (!rustplusInstance || !connectionStatus.connected) {
      return;
    }
    
    try {
      console.log('Checking Rust+ subscription status...');
      
      // Send the checkSubscription request
      checkSubscription()
        .then(result => {
          // Subscription is still valid, connection is good
          if (result.success) {
            console.log('Rust+ subscription check successful');
            // Update lastConnected timestamp
            connectionStatus.lastConnected = new Date();
            
            // Emit updated status to clients to show connection is still alive
            const io = socketInstance.getIO();
            io.emit('rustplusStatus', getStatus());
          } else {
            console.warn('Rust+ subscription check failed, attempting to reconnect...');
            // Instead of immediate reconnect, we'll check if the socket is still connected
            if (!rustplusInstance.isConnected()) {
              reconnect();
            }
          }
        })
        .catch(error => {
          console.error('Rust+ subscription check error:', error);
          connectionStatus.lastError = error.message;
          
          // Emit the error status to clients
          const io = socketInstance.getIO();
          io.emit('rustplusStatus', getStatus());
          
          // If we get an error during the check, connection might be lost
          if (connectionStatus.connected && !rustplusInstance.isConnected()) {
            console.warn('Connection appears to be lost, attempting to reconnect...');
            reconnect();
          }
        });
    } catch (error) {
      console.error('Error during subscription check interval:', error);
      
      // Update and emit error status
      connectionStatus.lastError = error.message;
      const io = socketInstance.getIO();
      io.emit('rustplusStatus', getStatus());
    }
  }, CHECK_INTERVAL);
}

/**
 * Check subscription status with the Rust server
 */
async function checkSubscription() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance) {
      reject(new Error('RustPlus instance not initialized'));
      return;
    }
    
    // Send the checkSubscription request
    rustplusInstance.sendRequest({
      checkSubscription: {}
    }, (message) => {
      // The Rust server will respond with a message object
      // Any response means the connection is still alive
      console.log("Check subscription response received");
      resolve({ success: true });
      return true; // Mark message as handled
    });
    
    // Set a timeout in case the request doesn't get a response
    setTimeout(() => {
      reject(new Error('Subscription check timed out'));
    }, 5000);
  });
}

/**
 * Attempt to reconnect to the Rust server
 */
async function reconnect() {
  console.log('Attempting to reconnect to Rust+ server...');
  
  // First disconnect if we're still connected
  if (rustplusInstance) {
    rustplusInstance.disconnect();
  }
  
  // Wait a short time before reconnecting
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Try to initialize again
  try {
    await initializeRustPlus();
  } catch (error) {
    console.error('Failed to reconnect to Rust+ server:', error);
    
    // Schedule another reconnect attempt
    setTimeout(reconnect, 10000); // Try again in 10 seconds
  }
}

/**
 * Handle broadcast messages from the Rust server
 */
function handleBroadcast(broadcast) {
  const io = socketInstance.getIO();
  
  // Entity changed broadcast (smart switches, alarms, etc.)
  if (broadcast.entityChanged) {
    io.emit('entityChanged', broadcast.entityChanged);
  }
  
  // Team changed broadcast
  if (broadcast.teamChanged) {
    io.emit('teamChanged', broadcast.teamChanged);
  }
  
  // Map markers updated broadcast
  if (broadcast.mapMarkers) {
    io.emit('mapMarkersUpdated', broadcast.mapMarkers);
  }
}

/**
 * Get server info from the Rust server
 */
async function getServerInfo() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getInfo((message) => {
      if (message.response && message.response.info) {
        resolve(message.response.info);
      } else {
        reject(new Error('Failed to get server info'));
      }
    });
  });
}

/**
 * Get the current status of the RustPlus connection
 */
function getStatus() {
  return {
    connected: connectionStatus.connected,
    lastConnected: connectionStatus.lastConnected,
    lastError: connectionStatus.lastError,
    serverInfo: connectionStatus.serverInfo,
    mapMarkers: connectionStatus.mapMarkers
  };
}

/**
 * Get the current time from the Rust server
 */
async function getTime() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getTime((message) => {
      if (message.response && message.response.time) {
        resolve(message.response.time);
      } else {
        reject(new Error('Failed to get time'));
      }
    });
  });
}

/**
 * Get the map from the Rust server
 */
async function getMap() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.getMap((message) => {
      if (message.response && message.response.map) {
        resolve(message.response.map);
      } else {
        reject(new Error('Failed to get map'));
      }
    });
  });
}

/**
 * Send a message to the team chat
 */
async function sendTeamMessage(message) {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      reject(new Error('Not connected to Rust+ server'));
      return;
    }
    
    rustplusInstance.sendTeamMessage(message, (response) => {
      if (response.response && response.response.ok) {
        resolve({ success: true });
      } else {
        reject(new Error('Failed to send team message'));
      }
    });
  });
}

/**
 * Get the map markers from the Rust server
 */
async function getMapMarkers() {
  return new Promise((resolve, reject) => {
    if (!rustplusInstance || !connectionStatus.connected) {
      return reject(new Error('Not connected to Rust+'));
    }

    try {
      rustplusInstance.getMapMarkers((message) => {
        if (message && message.response && message.response.mapMarkers) {
          // Store complete response in the connection status for caching
          connectionStatus.mapMarkers = message.response.mapMarkers;
          
          // Log the number of markers for debugging
          console.log(`Cached ${message.response.mapMarkers.markers.length} map markers`);
          
          resolve(message.response.mapMarkers);
        } else {
          console.log('Failed to get map markers - response format unexpected');
          console.log(JSON.stringify(message));
          reject(new Error('Failed to get map markers'));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Transform raw vending machine data into standardized format
 * @param {Array} machines - Raw vending machine data from Rust+
 * @returns {Array} - Standardized shop data
 */
function transformVendingMachines(machines, prefix) {
  return machines.map(machine => {
    // Process sell orders to standard format
    const sellOrders = (machine.sellOrders || []).map(order => {
      // Get item details from the database
      const itemSellingDetails = rustAssetManager.getItemById(order.itemId);
      const itemBuyingDetails = rustAssetManager.getItemById(order.currencyId);
      
      return {
        itemSellingStockQty: order.quantity || 0,
        itemSellingId: order.itemId,
        itemSellingDescription: itemSellingDetails?.description || "",
        itemSellingName: itemSellingDetails?.name || `Unknown Item (${order.itemId})`,
        itemSellingImage: itemSellingDetails?.image || '/img/items/unknown.png',
        itemSellingPrice: order.quantity || 0,
        itemBuyingId: order.currencyId,
        itemBuyingDescription: itemBuyingDetails?.description || "",
        itemBuyingName: itemBuyingDetails?.name || `Unknown Item (${order.currencyId})`,
        itemBuyingImage: itemBuyingDetails?.image || '/img/items/unknown.png',
        itemBuyingPrice: order.costPerItem || 0
      };
    });
    
    return {
      shopName: machine.name || "Unknown Shop",
      shopId: machine.id,
      sellOrders
    };
  });
}

/**
 * Calculate undercut prices for vending machines
 * @param {Array} allyShops - Shops that match the user's prefix
 * @param {Array} enemyShops - Shops that don't match the user's prefix
 * @returns {Array} - Array of undercut listings
 */
function calculateUndercutPrices(allyShops, enemyShops) {
  const undercutListings = [];
  
  // Process each ally shop
  allyShops.forEach(allyShop => {
    if (!allyShop.sellOrders || allyShop.sellOrders.length === 0) return;
    
    // Process each sell order in the ally shop
    allyShop.sellOrders.forEach(allySellOrder => {
      const itemSellingId = allySellOrder.itemSellingId;
      const itemBuyingId = allySellOrder.itemBuyingId;
      const allyPrice = allySellOrder.itemBuyingPrice;
      
      // Find matching enemy sell orders (same item, same currency)
      const matchingEnemySellOrders = [];
      
      enemyShops.forEach(enemyShop => {
        if (!enemyShop.sellOrders) return;
        
        enemyShop.sellOrders.forEach(enemySellOrder => {
          if (enemySellOrder.itemSellingId === itemSellingId && 
              enemySellOrder.itemBuyingId === itemBuyingId &&
              enemySellOrder.itemBuyingPrice < allyPrice) {
            
            // Add this enemy sell order to the matching list with shop info
            matchingEnemySellOrders.push({
              ...enemySellOrder,
              shopName: enemyShop.shopName,
              shopId: enemyShop.shopId
            });
          }
        });
      });
      
      // If we found any matching enemy sell orders that undercut the ally price
      if (matchingEnemySellOrders.length > 0) {
        // Sort by price (lowest first)
        matchingEnemySellOrders.sort((a, b) => a.itemBuyingPrice - b.itemBuyingPrice);
        
        // Create the undercut listing
        undercutListings.push({
          allySellOrder: {
            ...allySellOrder,
            shopName: allyShop.shopName,
            shopId: allyShop.shopId
          },
          enemySellOrders: matchingEnemySellOrders
        });
      }
    });
  });
  
  // Sort by price difference percentage (highest first)
  return undercutListings.sort((a, b) => {
    const aPriceDiff = a.allySellOrder.itemBuyingPrice - a.enemySellOrders[0].itemBuyingPrice;
    const aPercentDiff = (aPriceDiff / a.allySellOrder.itemBuyingPrice) * 100;
    
    const bPriceDiff = b.allySellOrder.itemBuyingPrice - b.enemySellOrders[0].itemBuyingPrice;
    const bPercentDiff = (bPriceDiff / b.allySellOrder.itemBuyingPrice) * 100;
    
    return bPercentDiff - aPercentDiff;
  });
}

/**
 * Get the cached map markers
 */
function getCachedMapMarkers() {
  // Return the cached map markers if they exist
  if (connectionStatus.mapMarkers && connectionStatus.mapMarkers.markers) {
    return connectionStatus.mapMarkers;
  }
  
  // If no cached markers, try to fetch them now
  console.log('No cached map markers found, fetching now...');
  if (connectionStatus.connected) {
    getMapMarkers()
      .then(markers => {
        console.log(`Fetched ${markers.markers.length} map markers on demand`);
        return markers;
      })
      .catch(err => {
        console.error('Error fetching map markers on demand:', err);
        return { markers: [] };
      });
  }
  
  // Return an empty structure if no cached data exists
  return { markers: [] };
}

/**
 * Helper function to send progress updates to the client
 */
function updateProgress(io, progress, message) {
  if (!io) return;
  
  console.log(`Progress ${progress}%: ${message}`);
  io.emit('itemDatabaseProgress', { progress, message });
}

/**
 * Ensure all required directories exist
 */
function ensureDirectoriesExist() {
  console.log('Ensuring data directories exist...');
  
  const dirsToCreate = [DATA_DIR, IMAGES_DIR, RUST_CLIENT_PATH, STEAMCMD_DIR];
  dirsToCreate.forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Check if SteamCMD is installed
 */
function isSteamCmdInstalled() {
  return fs.existsSync(steamCmdExePath);
}

/**
 * Download and install SteamCMD if not already installed
 */
async function installSteamCmd(io) {
  if (isSteamCmdInstalled()) {
    console.log('SteamCMD is already installed');
    return;
  }
  
  console.log('Installing SteamCMD...');
  updateProgress(io, 15, 'Downloading SteamCMD...');
  
  try {
    const downloadUrl = isWindows 
      ? 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' 
      : 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
    
    const downloadPath = path.join(STEAMCMD_DIR, isWindows ? 'steamcmd.zip' : 'steamcmd.tar.gz');
    
    await new Promise((resolve, reject) => {
      console.log(`Downloading from ${downloadUrl} to ${downloadPath}`);
      const file = fs.createWriteStream(downloadPath);
      
      https.get(downloadUrl, (response) => {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(downloadPath, () => {});
        reject(err);
      });
    });
    
    updateProgress(io, 18, 'Extracting SteamCMD...');
    
    // Extract the file
    if (isWindows) {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(downloadPath);
      zip.extractAllTo(STEAMCMD_DIR, true);
    } else {
      const { execSync } = require('child_process');
      execSync(`tar -xzf ${downloadPath} -C ${STEAMCMD_DIR}`);
      execSync(`chmod +x ${path.join(STEAMCMD_DIR, 'steamcmd.sh')}`);
    }
    
    // Clean up the downloaded file
    fs.unlinkSync(downloadPath);
    
    console.log('SteamCMD installed successfully');
  } catch (error) {
    console.error('Failed to install SteamCMD:', error);
    throw error;
  }
}

/**
 * Check if Steam is logged in
 */
async function checkSteamLogin() {
  // Check if Steam is logged in by looking at Steam config
  const steamConfigPath = process.env.APPDATA ? 
    path.join(process.env.APPDATA, 'Steam', 'config', 'loginusers.vdf') : 
    path.join(process.env.HOME, '.steam', 'config', 'loginusers.vdf');
  
  if (!fs.existsSync(steamConfigPath)) {
    return { loggedIn: false, message: 'Steam config not found' };
  }
  
  const content = fs.readFileSync(steamConfigPath, 'utf8');
  const loggedIn = content.includes('"RememberPassword"		"1"');
  
  if (!loggedIn) {
    return { loggedIn: false, message: 'Not logged in to Steam' };
  }
  
  // Try to extract username
  let username = '';
  const usernameMatch = content.match(/"AccountName"\s+"([^"]+)"/);
  if (usernameMatch && usernameMatch[1]) {
    username = usernameMatch[1];
  }
  
  return { loggedIn: true, username };
}

/**
 * Run a SteamCMD command with authentication
 */
async function runSteamCmd(args, io, progressMessage, credentials = null) {
  return new Promise((resolve, reject) => {
    if (!isSteamCmdInstalled()) {
      reject(new Error('SteamCMD not installed'));
      return;
    }
    
    // Add credentials if provided
    const fullArgs = [...args];
    if (credentials) {
      // Insert login credentials at the beginning
      fullArgs.unshift('+login', credentials.username, credentials.password);
    } else {
      // Try to use anonymous login if no credentials provided
      fullArgs.unshift('+login', 'anonymous');
    }
    
    console.log(`Running SteamCMD with command: ${steamCmdExePath} [ARGS HIDDEN]`);
    
    const steamCmdProcess = spawn(steamCmdExePath, fullArgs, { shell: true });
    
    let output = '';
    
    steamCmdProcess.stdout.on('data', (data) => {
      const chunk = data.toString().trim();
      output += chunk + '\n';
      console.log(`SteamCMD stdout: ${chunk}`);
      
      if (io && progressMessage) {
        // Extract a short preview of the output for progress message
        const outputPreview = chunk.substring(0, 80) + (chunk.length > 80 ? '...' : '');
        updateProgress(io, 30, `${progressMessage}: ${outputPreview}`);
      }
    });
    
    steamCmdProcess.stderr.on('data', (data) => {
      const chunk = data.toString().trim();
      console.error(`SteamCMD stderr: ${chunk}`);
    });
    
    steamCmdProcess.on('close', (code) => {
      console.log(`SteamCMD process exited with code ${code}`);
      
      // Check for login failures
      if (output.includes('FAILED login')) {
        reject(new Error('Steam login failed'));
        return;
      }
      
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`SteamCMD process failed with code ${code}`));
      }
    });
  });
}

/**
 * Download Rust client files using SteamCMD
 */
async function downloadRustClient(io, credentials = null) {
  updateProgress(io, 25, 'Checking for existing Rust client files...');
  
  // Check if we already have the required files
  if (fs.existsSync(path.join(RUST_CLIENT_PATH, 'Bundles', 'items'))) {
    const itemFiles = fs.readdirSync(path.join(RUST_CLIENT_PATH, 'Bundles', 'items'));
    if (itemFiles.length > 0) {
      console.log('Rust client files already downloaded');
      return true;
    }
  }
  
  console.log('Downloading Rust client files...');
  updateProgress(io, 30, 'Downloading Rust client files (this may take a while)...');
  
  try {
    const args = [
      `+force_install_dir "${RUST_CLIENT_PATH}"`,
      '+app_update', RUST_APP_ID,
      'validate',
      '+quit'
    ];
    
    await runSteamCmd(args, io, 'Downloading Rust client', credentials);
    
    console.log('Rust client files downloaded successfully');
    updateProgress(io, 50, 'Rust client files downloaded successfully');
    return true;
  } catch (error) {
    console.error('Error downloading Rust client files:', error);
    updateProgress(io, 0, `Error downloading Rust client: ${error.message}`);
    throw error;
  }
}

/**
 * Extract item data from Rust client files
 */
async function processRustAssets(io) {
  return new Promise((resolve, reject) => {
    try {
      updateProgress(io, 60, 'Processing Rust item files...');
      
      const itemsDir = path.join(RUST_CLIENT_PATH, 'Bundles', 'items');
      const items = {};
      let itemCount = 0;
      
      // Read all JSON files in the items directory
      const itemFiles = fs.readdirSync(itemsDir)
        .filter(file => file.endsWith('.json'));
      
      console.log(`Found ${itemFiles.length} item files to process`);
      
      // Process each item file
      itemFiles.forEach(file => {
        try {
          const filePath = path.join(itemsDir, file);
          const fileData = fs.readFileSync(filePath, 'utf8');
          const itemData = JSON.parse(fileData);
          
          if (!itemData.itemid) {
            console.warn(`Item file ${file} has no itemid, skipping`);
            return;
          }
          
          // Use the numeric itemid as the key in our database
          const itemId = itemData.itemid.toString();
          
          items[itemId] = {
            id: itemId,
            name: itemData.Name || file.replace('.json', ''),
            description: itemData.Description || '',
            category: itemData.Category || 'Uncategorized',
            numericId: itemData.itemid,
            image: `/api/items/images/${itemData.shortname}.png`,
            lastUpdated: new Date().toISOString()
          };
          
          itemCount++;
          
          // Update progress every 100 items
          if (itemCount % 100 === 0) {
            const progress = Math.min(Math.floor((itemCount / itemFiles.length) * 30) + 60, 90);
            updateProgress(io, progress, `Processed ${itemCount} of ${itemFiles.length} items`);
          }
        } catch (error) {
          console.error(`Error processing item file ${file}:`, error);
        }
      });
      
      // Save the database to disk
      const database = {
        metadata: {
          itemCount,
          lastUpdated: new Date().toISOString(),
          rustAppId: RUST_APP_ID
        },
        items
      };
      
      fs.writeFileSync(DATABASE_PATH, JSON.stringify(database, null, 2));
      
      // Copy image files from Rust client to our images directory
      copyItemImages(io);
      
      console.log(`Successfully processed ${itemCount} items`);
      
      resolve({
        success: true,
        message: `Database updated with ${itemCount} items`,
        itemCount
      });
    } catch (error) {
      console.error('Error processing item files:', error);
      reject(error);
    }
  });
}

/**
 * Copy item images from Rust client to our images directory
 */
function copyItemImages(io) {
  try {
    updateProgress(io, 90, 'Copying item images...');
    
    const itemImagesDir = path.join(RUST_CLIENT_PATH, 'Bundles', 'items');
    const pngFiles = fs.readdirSync(itemImagesDir)
      .filter(file => file.endsWith('.png'));
    
    console.log(`Found ${pngFiles.length} item images`);
    
    pngFiles.forEach(file => {
      const sourcePath = path.join(itemImagesDir, file);
      const destPath = path.join(IMAGES_DIR, file);
      
      fs.copyFileSync(sourcePath, destPath);
    });
    
    console.log(`Copied ${pngFiles.length} item images to ${IMAGES_DIR}`);
  } catch (error) {
    console.error('Error copying item images:', error);
    // Continue even if image copying fails
  }
}

/**
 * Update the item database
 */
async function updateItemDatabase(io, credentials = null) {
  try {
    // Start the update process
    updateProgress(io, 5, 'Starting database update...');
    
    // Make sure directories exist
    ensureDirectoriesExist();
    
    // Install SteamCMD if necessary
    if (!isSteamCmdInstalled()) {
      await installSteamCmd(io);
    }
    
    // If no credentials provided, check if we're logged in
    if (!credentials) {
      const loginStatus = await checkSteamLogin();
      
      if (!loginStatus.loggedIn) {
        updateProgress(io, 0, `Steam login required: ${loginStatus.message}`);
        return {
          success: false,
          requireSteamLogin: true,
          message: loginStatus.message
        };
      }
      
      // We're logged in, no need for explicit credentials
      console.log(`Using existing Steam login for user: ${loginStatus.username}`);
    }
    
    // Download Rust client if necessary
    await downloadRustClient(io, credentials);
    
    // Process Rust assets
    const result = await processRustAssets(io);
    
    // Update complete
    updateProgress(io, 100, 'Database update complete!');
    
    return result;
  } catch (error) {
    console.error('Error updating database:', error);
    updateProgress(io, 0, `Error: ${error.message}`);
    
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

module.exports = {
  initializeRustPlus,
  getStatus,
  getTime,
  getMap,
  sendTeamMessage,
  checkSubscription,
  getMapMarkers,
  calculateUndercutPrices,
  getCachedMapMarkers,
  transformVendingMachines,
  updateItemDatabase: rustAssetManager.updateItemDatabase,
  checkSteamLogin: rustAssetManager.checkSteamLogin
}; 