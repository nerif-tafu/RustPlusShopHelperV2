const fs = require('fs');
const path = require('path');

class RustAssetManager {

    constructor(directory) {
        this.directory = directory;
    }

    /***
     * Returns the path to the bundled Rust items directory.
     * "<drive>:\SteamLibrary\steamapps\common\Rust\Bundles\items\"
     * @return {string}
     */
    getBundleItemsDirectory() {
        return path.join(this.directory, 'Bundles/items/');
    }

    /**
     * Returns a list of filenames for all of the item image files.
     * "<drive>:\SteamLibrary\steamapps\common\Rust\Bundles\items\*.png"
     */
    getImageFiles() {
        return fs.readdirSync(this.getBundleItemsDirectory()).filter(filename => filename.includes('.png'));
    }

    /**
     * Returns a list of filenames for all of the item metadata files.
     * "<drive>:\SteamLibrary\steamapps\common\Rust\Bundles\items\*.json"
     */
    getMetadataFiles() {
        return fs.readdirSync(this.getBundleItemsDirectory()).filter(filename => filename.includes('.json'));
    }

    /**
     * Compile item metadata from the Rust game files
     * @returns {string} - JSON string of item metadata
     */
    compileItemsMetadata() {
        try {
            const items = [];
            // Make sure the directories exist
            if (!fs.existsSync(this.directory)) {
                console.error('Rust server path does not exist:', this.directory);
                return JSON.stringify([]);
            }
            
            const bundleItemsDir = this.getBundleItemsDirectory();
            if (!fs.existsSync(bundleItemsDir)) {
                console.error('Bundle items directory does not exist:', bundleItemsDir);
                return JSON.stringify([]);
            }
            
            // Get all item files
            const itemFiles = this.getImageFiles();
            
            // Extract metadata for each item
            itemFiles.forEach(file => {
                const shortname = path.basename(file, path.extname(file));
                const name = this.formatItemName(shortname);
                
                items.push({
                    shortname,
                    name,
                    description: this.getItemDescription(shortname),
                    image: `${shortname}.png`
                });
            });
            
            return JSON.stringify(items);
        } catch (error) {
            console.error('Error compiling item metadata:', error);
            return JSON.stringify([]);
        }
    }

    /**
     * Writes the compiled items metadata to the provided destination
     * @param destination
     */
    writeItemsMetadata(destination) {
        fs.writeFileSync(destination, this.compileItemsMetadata());
    }

    /**
     * Copy all item images to the provided destination
     * @param destination
     */
    copyItemImages(destination) {
        this.getImageFiles().forEach((image) => {
            const source = path.join(this.getBundleItemsDirectory(), image);
            const dest = path.join(destination, image);
            fs.copyFileSync(source, dest);
        });
    }

    // Add a new method to extract item definitions to JSON files
    extractItemDefinitions(outputDir) {
        try {
            console.log(`Extracting item definitions to ${outputDir}...`);
            
            // Ensure the output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // Check if rust server path exists
            if (!fs.existsSync(this.directory)) {
                throw new Error(`Rust server path does not exist: ${this.directory}`);
            }
            
            const bundleItemsDir = this.getBundleItemsDirectory();
            if (!fs.existsSync(bundleItemsDir)) {
                throw new Error(`Bundle items directory does not exist: ${bundleItemsDir}`);
            }
            
            // Extract raw item data from the Rust server files
            const itemDefinitionsPath = this.getBundleItemsDirectory();
            const itemDefFiles = fs.readdirSync(itemDefinitionsPath);
            
            console.log(`Found ${itemDefFiles.length} item files in ${itemDefinitionsPath}`);
            
            // Use the metadata files to generate our data
            const metadataFiles = this.getMetadataFiles();
            console.log(`Found ${metadataFiles.length} item definition files`);
            
            if (metadataFiles.length === 0) {
                throw new Error("No item metadata JSON files found in Bundles/items directory.");
            }
            
            // Process each metadata file
            let processedCount = 0;
            metadataFiles.forEach(file => {
                try {
                    // Read the JSON file
                    const filePath = path.join(itemDefinitionsPath, file);
                    const itemData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    // Extract the shortname from the filename (remove .json extension)
                    const shortname = path.basename(file, '.json');
                    
                    // Create the item definition - preserve original data and add what we need
                    const itemDef = {
                        // Use the original itemid if it exists, otherwise generate one
                        itemid: itemData.itemid || this.getItemNumericId(shortname),
                        shortname: shortname,
                        Name: itemData.Name || itemData.displayName || itemData.name || shortname.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        Description: itemData.Description || itemData.description || '',
                        Category: itemData.Category || itemData.category || this.getCategoryForItem(shortname) || 'Miscellaneous'
                    };
                    
                    // Write to JSON file in the output directory
                    const outputFile = path.join(outputDir, `${shortname}.json`);
                    fs.writeFileSync(outputFile, JSON.stringify(itemDef, null, 2));
                    processedCount++;
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error);
                }
            });
            
            console.log(`Extracted ${processedCount} item definitions`);
        } catch (error) {
            console.error('Error extracting item definitions:', error);
            throw error;
        }
    }

    // Helper method to get numeric ID for an item
    getItemNumericId(shortname) {
        // This would ideally read from Rust's item mapping
        // For now, we'll use a hash function to generate consistent negative IDs
        // similar to how Rust actually stores them
        let hash = 0;
        for (let i = 0; i < shortname.length; i++) {
            const char = shortname.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash; // Rust uses negative IDs for many items
    }

    // Helper method to categorize items
    getCategoryForItem(shortname) {
        if (shortname.includes('rifle') || shortname.includes('pistol') || shortname.includes('shotgun')) {
            return 'Weapons';
        } else if (shortname.includes('ammo')) {
            return 'Ammunition';
        } else if (shortname.includes('metal') || shortname.includes('wood') || shortname.includes('stone')) {
            return 'Resources';
        } else if (shortname.includes('gear') || shortname.includes('helmet') || shortname.includes('boots')) {
            return 'Attire';
        }
        return 'Miscellaneous';
    }

    /**
     * Simple method to capitalize words in a string
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalizeWords(str) {
        return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }
}

module.exports = RustAssetManager; 