const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const RustAssetManager = require('../services/RustAssetManager');
const os = require('os');

// Constants
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'itemDatabase.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const RUST_SERVER_PATH = path.join(DATA_DIR, 'rustserver');
const STEAMCMD_DIR = path.join(DATA_DIR, 'steamcmd');
const RUST_APP_ID = 258550; // Rust Dedicated Server

// Ensure directories exist
function ensureDirectoriesExist() {
  console.log('Ensuring data directories exist...');
  
  const dirsToCreate = [DATA_DIR, IMAGES_DIR, RUST_SERVER_PATH, STEAMCMD_DIR];
  dirsToCreate.forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  console.log('Directory check complete');
}

// Check if SteamCMD is installed
function isSteamCmdInstalled() {
  const isWindows = process.platform === 'win32';
  const steamCmdExe = path.join(STEAMCMD_DIR, isWindows ? 'steamcmd.exe' : 'steamcmd.sh');
  return fs.existsSync(steamCmdExe);
}

// Download and install SteamCMD
async function installSteamCmd() {
  const isWindows = process.platform === 'win32';
  
  if (isSteamCmdInstalled()) {
    console.log('SteamCMD is already installed');
    return;
  }
  
  console.log('Installing SteamCMD...');
  
  try {
    if (isWindows) {
      // Windows installation
      const steamCmdZip = path.join(STEAMCMD_DIR, 'steamcmd.zip');
      
      // Download steamcmd.zip
      console.log('Downloading SteamCMD for Windows...');
      execSync(
        `curl -o "${steamCmdZip}" https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip`,
        { stdio: 'inherit' }
      );
      
      // Extract the zip file
      console.log('Extracting SteamCMD...');
      const extractCommand = `powershell -command "Expand-Archive -Path '${steamCmdZip}' -DestinationPath '${STEAMCMD_DIR}' -Force"`;
      execSync(extractCommand, { stdio: 'inherit' });
      
      // Clean up
      fs.unlinkSync(steamCmdZip);
      
    } else {
      // Linux installation
      console.log('Downloading SteamCMD for Linux...');
      execSync(
        `curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar -xzf - -C "${STEAMCMD_DIR}"`,
        { stdio: 'inherit' }
      );
      
      // Make steamcmd.sh executable
      execSync(`chmod +x "${path.join(STEAMCMD_DIR, 'steamcmd.sh')}"`, { stdio: 'inherit' });
    }
    
    console.log('SteamCMD installed successfully');
    
  } catch (error) {
    console.error('Failed to install SteamCMD:', error);
    throw error;
  }
}

// Run SteamCMD to download Rust server
async function downloadRustServer(io) {
  // Check if we already have the required files
  if (fs.existsSync(path.join(RUST_SERVER_PATH, 'Bundles', 'items'))) {
    const itemFiles = fs.readdirSync(path.join(RUST_SERVER_PATH, 'Bundles', 'items'));
    if (itemFiles.length > 0) {
      console.log('Rust server files already downloaded');
      return;
    }
  }
  
  // Make sure SteamCMD is installed
  if (!isSteamCmdInstalled()) {
    await installSteamCmd();
  }
  
  console.log('Downloading Rust server files using SteamCMD...');
  
  try {
    const isWindows = process.platform === 'win32';
    const steamCmdPath = path.join(STEAMCMD_DIR, isWindows ? 'steamcmd.exe' : 'steamcmd.sh');
    
    // Prepare SteamCMD arguments
    const args = [
      '+force_install_dir', `"${RUST_SERVER_PATH}"`,
      '+login', 'anonymous',
      '+app_update', RUST_APP_ID.toString(),
      'validate',
      '+quit'
    ];
    
    // On Windows, spawn a command prompt to run SteamCMD
    if (isWindows) {
      console.log(`Running: ${steamCmdPath} ${args.join(' ')}`);
      execSync(`"${steamCmdPath}" ${args.join(' ')}`, {
        stdio: 'inherit'
      });
    } else {
      // On Linux, run steamcmd.sh directly
      console.log(`Running: ${steamCmdPath} ${args.join(' ')}`);
      execSync(`"${steamCmdPath}" ${args.join(' ')}`, {
        stdio: 'inherit'
      });
    }
    
    console.log('Rust server files downloaded successfully!');
    
  } catch (error) {
    console.error('Error downloading Rust server files:', error);
    throw error;
  }
}

// Process the Rust assets
async function processRustAssets(io) {
  try {
    console.log('Starting Rust asset extraction...');
    
    // Create the asset manager
    const assetManager = new RustAssetManager(RUST_SERVER_PATH);
    
    // Create itemDefinitions directory if it doesn't exist
    const itemDefinitionsDir = path.join(DATA_DIR, 'itemDefinitions');
    if (!fs.existsSync(itemDefinitionsDir)) {
      console.log(`Creating itemDefinitions directory: ${itemDefinitionsDir}`);
      fs.mkdirSync(itemDefinitionsDir, { recursive: true });
    }
    
    // Extract item definitions from Rust server files
    console.log('Extracting item definitions to JSON files...');
    assetManager.extractItemDefinitions(itemDefinitionsDir);
    
    // Extract item metadata
    console.log('Extracting item metadata...');
    const itemsMetadata = JSON.parse(assetManager.compileItemsMetadata());
    
    // Process the item metadata with proper numeric IDs
    console.log('Processing items to include numeric IDs...');
    const { items, itemCount } = await processItemFiles(DATA_DIR, io);
    
    // Create the database object
    const database = {
      metadata: {
        lastUpdated: new Date().toISOString(),
        itemCount: itemCount
      },
      items: items  // Use the processed items with numeric IDs
    };
    
    // Save the database
    console.log(`Saving database with ${itemCount} items including numeric IDs...`);
    fs.writeFileSync(DATABASE_PATH, JSON.stringify(database, null, 2));
    
    // Copy item images
    console.log('Copying item images...');
    assetManager.copyItemImages(IMAGES_DIR);
    
    console.log('Asset extraction complete!');
    return {
      success: true,
      message: `Extracted ${itemCount} items with numeric IDs and images from Rust game files`
    };
  } catch (error) {
    console.error('Error processing Rust assets:', error);
    return {
      success: false,
      message: `Error extracting data: ${error.message}`
    };
  }
}

// Modify the function that processes item files to use numeric IDs
function processItemFiles(dataDir, io) {
  return new Promise((resolve, reject) => {
    try {
      console.log('Processing JSON item files...');
      const items = {};
      let itemCount = 0;
      
      // Get list of .json files in itemDefinitions directory
      const itemDefinitionsDir = path.join(dataDir, 'itemDefinitions');
      const itemFiles = fs.readdirSync(itemDefinitionsDir).filter(file => file.endsWith('.json'));
      console.log(`Found ${itemFiles.length} item definition files`);
      
      // Process each file
      itemFiles.forEach(file => {
        try {
          const filePath = path.join(itemDefinitionsDir, file);
          const itemData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          // Use the numeric itemid as the key in our database
          const itemId = itemData.itemid.toString();
          
          items[itemId] = {
            id: itemId,
            name: itemData.Name || file.replace('.json', ''),
            description: itemData.Description || '',
            category: itemData.Category || 'Uncategorized',
            numericId: itemData.itemid, // Store the raw numeric ID for exact matching
            shortname: itemData.shortname || '',
            image: `/api/items/images/${itemData.shortname}.png`,
            lastUpdated: new Date().toISOString()
          };
          
          itemCount++;
          
          // Update progress every 100 items
          if (itemCount % 100 === 0) {
            const progress = Math.min(Math.floor((itemCount / itemFiles.length) * 70) + 25, 95);
            io.emit('itemDatabaseProgress', { 
              progress, 
              message: `Processed ${itemCount} of ${itemFiles.length} items` 
            });
          }
        } catch (error) {
          console.error(`Error processing item file ${file}:`, error);
        }
      });
      
      console.log(`Successfully processed ${itemCount} items`);
      resolve({ items, itemCount });
    } catch (error) {
      console.error('Error processing item files:', error);
      reject(error);
    }
  });
}

// Main function
async function main(io) {
  try {
    ensureDirectoriesExist();
    
    // Update progress to 10%
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 10, 
        message: 'Starting SteamCMD installation...' 
      });
    }
    
    // Check if SteamCMD needs installation
    if (!isSteamCmdInstalled()) {
      if (io) {
        io.emit('itemDatabaseProgress', { 
          progress: 15, 
          message: 'Downloading SteamCMD...' 
        });
      }
      await installSteamCmd();
    }
    
    // Update progress to 20%
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 20, 
        message: 'Checking Rust server files...' 
      });
    }
    
    // Check if we need to download Rust server files
    const needsDownload = !fs.existsSync(path.join(RUST_SERVER_PATH, 'Bundles', 'items')) || 
                         fs.readdirSync(path.join(RUST_SERVER_PATH, 'Bundles', 'items')).length === 0;
    
    if (needsDownload) {
      if (io) {
        io.emit('itemDatabaseProgress', { 
          progress: 25, 
          message: 'Downloading Rust server files (this may take a while)...' 
        });
      }
    }
    
    await downloadRustServer(io);
    
    // Update progress to 70%
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 70, 
        message: 'Processing Rust assets...' 
      });
    }
    
    const result = await processRustAssets(io);
    
    // Update progress to 100%
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 100, 
        message: 'Database update complete!' 
      });
    }
    
    console.log(result.message);
    return result;
  } catch (error) {
    console.error('Error:', error);
    
    // Send error to frontend
    if (io) {
      io.emit('itemDatabaseProgress', { 
        progress: 0, 
        message: `Error: ${error.message}` 
      });
    }
    
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { main }; 