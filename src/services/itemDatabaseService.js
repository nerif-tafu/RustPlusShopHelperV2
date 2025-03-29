import axios from 'axios';

class ItemDatabaseService {
  constructor() {
    this.items = null;
    this.loading = false;
    this.error = null;
  }

  async loadItems() {
    if (this.items) return this.items; // Return cached items if available
    
    this.loading = true;
    this.error = null;
    
    try {
      const response = await axios.get('/api/items?all=true');
      if (response.data.success) {
        this.items = response.data.data.items || {};
        console.log(`Loaded ${Object.keys(this.items).length} items from the database`);
        return this.items;
      } else {
        this.error = 'Failed to load item database';
        console.error(this.error);
        return {};
      }
    } catch (error) {
      this.error = error.message || 'Network error';
      console.error('Error loading item database:', error);
      return {};
    } finally {
      this.loading = false;
    }
  }

  async getItemById(id) {
    if (!this.items) {
      await this.loadItems();
    }
    // Convert to string if it's a number
    const idStr = id.toString();
    
    // Try direct lookup first
    if (this.items[idStr]) {
      return this.items[idStr];
    }
    
    // If not found, try to find by numericId (some databases might store negative IDs differently)
    for (const key in this.items) {
      if (this.items[key].numericId === parseInt(idStr)) {
        return this.items[key];
      }
    }
    
    return null;
  }

  async getItemsByIds(ids) {
    if (!this.items) {
      await this.loadItems();
    }
    
    const result = {};
    ids.forEach(id => {
      if (this.items[id]) {
        result[id] = this.items[id];
      }
    });
    
    return result;
  }
}

// Create a singleton instance
const itemDatabaseService = new ItemDatabaseService();

export default itemDatabaseService; 