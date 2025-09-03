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
    
    // Try direct lookup first (by shortname)
    if (this.items[id]) {
      return this.items[id];
    }
    
    // If not found, try to find by numericId
    for (const key in this.items) {
      if (this.items[key].numericId === parseInt(id)) {
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

  async updateDatabase() {
    try {
      this.loading = true;
      this.error = null;
      
      const response = await axios.post('/api/items/update');
      if (response.data.success) {
        // Clear cache to force reload
        this.items = null;
        return { success: true, message: response.data.message };
      } else {
        this.error = 'Failed to update database';
        return { success: false, error: this.error };
      }
    } catch (error) {
      this.error = error.message || 'Network error';
      console.error('Error updating database:', error);
      return { success: false, error: this.error };
    } finally {
      this.loading = false;
    }
  }

  async searchItems(query) {
    if (!this.items) {
      await this.loadItems();
    }
    
    if (!query || query.trim() === '') {
      return {};
    }
    
    const searchTerm = query.toLowerCase().trim();
    const results = {};
    
    for (const key in this.items) {
      const item = this.items[key];
      if (
        item.name.toLowerCase().includes(searchTerm) ||
        item.shortname.toLowerCase().includes(searchTerm) ||
        item.category.toLowerCase().includes(searchTerm)
      ) {
        results[key] = item;
      }
    }
    
    return results;
  }
}

// Create a singleton instance
const itemDatabaseService = new ItemDatabaseService();

export default itemDatabaseService; 