const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const express = require('express');

// Constants for asset management
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'itemDatabase.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const RUST_CLIENT_PATH = path.join(DATA_DIR, 'rustclient');
const STEAMCMD_DIR = path.join(DATA_DIR, 'steamcmd');
const RUST_APP_ID = '252490'; // Rust Client
const isWindows = process.platform === 'win32';
const steamCmdExePath = path.join(STEAMCMD_DIR, isWindows ? 'steamcmd.exe' : 'steamcmd.sh');
const STEAM_CREDENTIALS_PATH = path.join(DATA_DIR, 'steamCredentials.json');

// Cache for the database
let itemDatabaseCache = null;
let lastCacheTime = 0;

// Track Steam login state
let steamLoginState = {
  loggedIn: false,
  username: '',
  timestamp: 0
};

// Load saved username on startup
try {
  if (fs.existsSync(STEAM_CREDENTIALS_PATH)) {
    const savedCredentials = JSON.parse(fs.readFileSync(STEAM_CREDENTIALS_PATH, 'utf8'));
    steamLoginState.username = savedCredentials.username || '';
    console.log(`Loaded saved Steam username: ${steamLoginState.username}`);
  }
} catch (error) {
  console.error('Error loading saved Steam credentials:', error);
}

/**
 * Helper function to send progress updates to the client
 */
function updateProgress(io, progress, message) {
  // Try to get io from global if not passed directly
  const socketIo = io || global.io;
  
  if (!socketIo) {
    console.warn('No Socket.IO instance available for progress updates');
    return;
  }
  
  console.log(`Progress ${progress}%: ${message}`);
  socketIo.emit('itemDatabaseProgress', { progress, message });
  console.log('Progress update emitted via socket.io');
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
  if (io) updateProgress(io, 15, 'Downloading SteamCMD...');
  
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
    
    if (io) updateProgress(io, 18, 'Extracting SteamCMD...');
    
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
 * Run a SteamCMD command and capture output
 */
async function runSteamCmd(args, io, progressMessage, credentials = null) {
  return new Promise((resolve, reject) => {
    const cmdArgs = [...args];
    
    // If credentials were provided, add them to the command
    if (credentials) {
      console.log('Attempting login with provided credentials');
      // Insert login credentials at the start, before any other commands
      cmdArgs.unshift('+login', credentials.username, credentials.password);
    } else {
      // Try to use cached credentials if possible - need to include username when available
      if (steamLoginState.loggedIn) {
        console.log(`Attempting login with cached credentials for ${steamLoginState.username}`);
        cmdArgs.unshift('+login', steamLoginState.username);
      } else {
        // If we don't have a cached username, run without login command
        // This might fail, but better than an invalid command
        console.log('No cached credentials available, running without login');
      }
    }
    
    console.log(credentials);
    
    console.log(`Running SteamCMD command: ${steamCmdExePath} ${cmdArgs.join(' ').replace(credentials?.password || '', '********')}`);
    console.log(steamCmdExePath, cmdArgs);

    const steamCmdProcess = spawn(steamCmdExePath, cmdArgs, { shell: true });
    
    steamCmdProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`SteamCMD stdout: ${output}`);
      
      if (io && progressMessage) {
        // Extract a short preview of the output for progress message
        const outputPreview = output.substring(0, 80) + (output.length > 80 ? '...' : '');
        updateProgress(io, 30, `${progressMessage}: ${outputPreview}`);
      }
    });
    
    steamCmdProcess.stderr.on('data', (data) => {
      console.error(`SteamCMD stderr: ${data.toString().trim()}`);
    });
    
    steamCmdProcess.on('close', (code) => {
      console.log(`SteamCMD process exited with code ${code}`);
      
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SteamCMD process failed with code ${code}`));
      }
    });
  });
}

/**
 * Check Steam login status
 */
async function checkSteamLogin() {
  // Try to detect if we can login with cached credentials by running SteamCMD with just +login command
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    
    // We need to check if we know a username from previous logins
    let username = steamLoginState.username || '';
    
    // If we don't have a username, we can't check for cached credentials
    if (!username) {
      console.log('No username available to check cached login status');
      resolve({
        success: true,
        loggedIn: false,
        username: '',
        message: 'First-time setup: Please enter your Steam credentials'
      });
      return;
    }
    
    // Try with username to see if it uses cached credentials or asks for password
    const command = `"${steamCmdExePath}" +login ${username} +quit`;
    
    console.log('Testing SteamCMD cached login...');
    
    exec(command, (error, stdout, stderr) => {
      if (stdout) console.log(`SteamCMD login test stdout: ${stdout}`);
      if (stderr) console.error(`SteamCMD login test stderr: ${stderr}`);
      
      // Check if login was successful without requiring password
      if (stdout.includes('Logging in using cached credentials') || 
          (stdout.includes(`Logging in user '${username}'`) && !stdout.includes('password:'))) {
        // Extract username from output if possible
        const usernameMatch = stdout.match(/Logging in user '([^']+)'/);
        const username = usernameMatch ? usernameMatch[1] : 'unknown';
        
        // Update our internal login state
        steamLoginState = {
          loggedIn: true,
          username: username,
          timestamp: Date.now()
        };
        
        console.log(`Detected valid cached Steam login for: ${username}`);
        
        resolve({
          success: true,
          loggedIn: true,
          username: username,
          message: `Logged in as ${username}`
        });
      } else if (stdout.includes('Cached credentials not found') || 
                stdout.includes('password:') || 
                stdout.includes('FAILED')) {
        // No cached credentials or they're invalid
        console.log('No valid cached Steam credentials found');
        
        resolve({
          success: true,
          loggedIn: false,
          username: '',
          message: 'Steam login required: Please enter your credentials'
        });
      } else {
        // Unclear outcome, assume not logged in
        console.log('Unclear Steam login status, assuming not logged in');
        
        resolve({
          success: true,
          loggedIn: false,
          username: '',
          message: 'Steam login required: Unable to determine login status'
        });
      }
    });
  });
}

/**
 * Download Rust client files using SteamCMD
 */
async function downloadRustClient(io, credentials = null) {
  try {
    updateProgress(io, 25, 'Checking for Rust client files...');
    
    // Check if we already have the required files
    if (fs.existsSync(path.join(RUST_CLIENT_PATH, 'Bundles', 'items'))) {
      const itemFiles = fs.readdirSync(path.join(RUST_CLIENT_PATH, 'Bundles', 'items'));
      if (itemFiles.length > 0) {
        console.log('Rust client files already downloaded');
        updateProgress(io, 40, 'Rust client files already downloaded');
        return;
      }
    }
    
    updateProgress(io, 30, 'Downloading Rust client files...');
    
    // Create the arguments for downloading Rust client
    const args = [
      '+force_install_dir', `"${RUST_CLIENT_PATH}"`,
      '+app_update', RUST_APP_ID,
      'validate',
      '+quit'
    ];
    
    // Run SteamCMD to download Rust client
    await runSteamCmd(args, io, 'Downloading Rust client', credentials);
    
    console.log('Rust client files downloaded successfully!');
    updateProgress(io, 50, 'Rust client files downloaded successfully!');
  } catch (error) {
    console.error('Error downloading Rust client files:', error);
    throw error;
  }
}

/**
 * Process Rust assets to build the item database
 */
async function processRustAssets(io) {
  return new Promise(async (resolve, reject) => {
    try {
      updateProgress(io, 60, 'Processing Rust assets...');
      
      // Look for item json files in the bundles directory
      const bundlesDir = path.join(RUST_CLIENT_PATH, 'Bundles');
      const itemsDir = path.join(bundlesDir, 'items');
      
      if (!fs.existsSync(itemsDir)) {
        throw new Error(`Items directory not found: ${itemsDir}`);
      }
      
      // Get all JSON files in the items directory
      const itemFiles = fs.readdirSync(itemsDir)
        .filter(file => file.endsWith('.json'));
      
      console.log(`Found ${itemFiles.length} item files in ${itemsDir}`);
      
      if (itemFiles.length === 0) {
        throw new Error('No item files found');
      }
      
      // Process each item file
      const items = {};
      let itemCount = 0;
      
      itemFiles.forEach(file => {
        try {
          const filePath = path.join(itemsDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          let itemData;
          
          try {
            itemData = JSON.parse(fileContent);
          } catch (parseError) {
            console.error(`Error parsing JSON in ${file}:`, parseError);
            return; // Skip this file
          }
          
          // Use the numeric itemid as the key in our database
          const itemId = itemData.itemid.toString();
          
          items[itemId] = {
            id: itemId,
            name: itemData.Name || file.replace('.json', ''),
            description: itemData.Description || '',
            category: itemData.Category || 'Uncategorized',
            numericId: itemData.itemid,
            shortname: itemData.shortname || '',
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
    
    // Clear the cache to force a reload
    itemDatabaseCache = null;
    
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

/**
 * Get item data by ID
 */
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

/**
 * Express middleware to serve item images
 */
function serveItemImages(app) {
  app.use('/api/items/images', express.static(IMAGES_DIR));
}

/**
 * Function to get database stats
 */
async function getDatabaseStats() {
  const database = loadDatabase();
  return {
    itemCount: database.metadata?.itemCount || 0,
    lastUpdated: database.metadata?.lastUpdated || null
  };
}

/**
 * Function to get all items from the database
 */
function getAllItems() {
  try {
    const database = loadDatabase();
    return database.items || {};
  } catch (error) {
    console.error('Error getting all items:', error);
    return {};
  }
}

/**
 * Handle Steam login attempt
 */
async function steamLogin(username, password) {
  return new Promise(async (resolve, reject) => {
    try {
      // First ensure directories exist and install SteamCMD if needed
      ensureDirectoriesExist();
      
      // Check if SteamCMD executable exists and install if necessary
      if (!isSteamCmdInstalled()) {
        console.log("SteamCMD not found, installing first...");
        await installSteamCmd();
      }
      
      // Now proceed with login attempt
      const { exec } = require('child_process');
      
      // On Windows, enclose the password in double quotes to handle special chars
      const command = `"${steamCmdExePath}" +login ${username} "${password}" +quit`;
      
      console.log(`Running command: ${command.replace(password, '********')}`);
      
      exec(command, (error, stdout, stderr) => {
        if (stdout) console.log(`SteamCMD stdout: ${stdout}`);
        if (stderr) console.error(`SteamCMD stderr: ${stderr}`);
        
        if (error) {
          console.error(`SteamCMD exec error:`, error);
          reject(new Error(`Steam login failed: ${error.message}`));
          return;
        }
        
        // Check if login was successful (no 'FAILED' in output)
        if (stdout.includes('FAILED')) {
          reject(new Error('Invalid password or login failed'));
          return;
        }
        
        // Update our login state
        steamLoginState = {
          loggedIn: true,
          username: username,
          timestamp: Date.now()
        };
        
        // Save username to file for persistence
        try {
          fs.writeFileSync(STEAM_CREDENTIALS_PATH, JSON.stringify({ username }));
          console.log(`Saved Steam username to ${STEAM_CREDENTIALS_PATH}`);
        } catch (error) {
          console.error('Error saving Steam credentials:', error);
        }
        
        // If we got here, login succeeded
        resolve({
          loggedIn: true,
          username,
          message: 'Steam login successful'
        });
      });
    } catch (error) {
      console.error("Error during Steam login preparation:", error);
      reject(new Error(`Failed to prepare for Steam login: ${error.message}`));
    }
  });
}

/**
 * Reset the entire item database and remove all downloaded files
 */
async function resetItemDatabase() {
  console.log('Resetting item database and removing all downloaded files...');
  
  const dirsToRemove = [
    IMAGES_DIR,
    path.join(DATA_DIR, 'itemDefinitions'),
    RUST_CLIENT_PATH,
    path.join(DATA_DIR, 'rustserver'),
    STEAMCMD_DIR
  ];
  
  const filesToRemove = [
    DATABASE_PATH,
    STEAM_CREDENTIALS_PATH
  ];
  
  // Remove directories
  for (const dir of dirsToRemove) {
    if (fs.existsSync(dir)) {
      console.log(`Removing directory: ${dir}`);
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  }
  
  // Remove files
  for (const file of filesToRemove) {
    if (fs.existsSync(file)) {
      console.log(`Removing file: ${file}`);
      await fs.promises.unlink(file);
    }
  }
  
  // Reset login state
  steamLoginState = {
    loggedIn: false,
    username: '',
    timestamp: 0
  };
  
  // Clear cache
  itemDatabaseCache = null;
  lastCacheTime = 0;
  
  console.log('Database reset complete');
  return { success: true };
}

module.exports = {
  // Database functions
  loadDatabase,
  getItemById,
  getAllItems,
  getDatabaseStats,
  updateItemDatabase,
  serveItemImages,
  
  // Steam functions
  checkSteamLogin,
  steamLogin,          // New function for login
  runSteamCmd,
  
  // Constants
  IMAGES_DIR,
  DATABASE_PATH,
  RUST_CLIENT_PATH,
  STEAMCMD_DIR,
  RUST_APP_ID,
  
  // New functions
  resetItemDatabase
}; 