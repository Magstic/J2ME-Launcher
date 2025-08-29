// src/store/GameStore.js
// Linus-style unified state management: simple, predictable, fast

class GameStore {
  constructor() {
    this.state = {
      games: [], // Array of game objects for React compatibility
      gamesById: {}, // filePath -> game object for O(1) lookup
      folderMembership: {}, // filePath -> array of folderIds
      folders: {}, // folderId -> folder object
      ui: {
        selectedGames: [],
        dragState: { isDragging: false, draggedItems: [] },
        searchTerm: '',
        loading: false
      }
    };
    
    this.listeners = new Set();
    this.actionQueue = [];
    this.isDispatching = false;
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Get current state (immutable)
  getState() {
    return this.state;
  }

  // Dispatch action with batching
  dispatch(action) {
    if (this.isDispatching) {
      this.actionQueue.push(action);
      return;
    }

    this.isDispatching = true;
    
    try {
      const newState = this.reduce(this.state, action);
      if (newState !== this.state) {
        this.state = newState;
        this.notifyListeners();
      }
    } finally {
      this.isDispatching = false;
      
      // Process queued actions
      if (this.actionQueue.length > 0) {
        const queued = this.actionQueue.splice(0);
        queued.forEach(queuedAction => this.dispatch(queuedAction));
      }
    }
  }

  // Reducer: pure function that returns new state
  reduce(state, action) {
    switch (action.type) {
      case 'GAMES_LOADED': {
        const games = [...action.payload];
        const gamesById = {};
        games.forEach(game => {
          gamesById[game.filePath] = game;
        });
        
        return {
          ...state,
          games,
          gamesById,
          ui: { ...state.ui, loading: false }
        };
      }

      case 'GAMES_INCREMENTAL_UPDATE': {
        const { added = [], updated = [], removed = [] } = action.payload;
        const gamesById = { ...state.gamesById };
        
        // Add new games
        added.forEach(game => {
          gamesById[game.filePath] = game;
        });
        
        // Update existing games
        updated.forEach(game => {
          gamesById[game.filePath] = game;
        });
        
        // Remove deleted games
        removed.forEach(filePath => {
          delete gamesById[filePath];
        });
        
        // Rebuild games array
        const games = Object.values(gamesById);
        
        return { ...state, games, gamesById };
      }

      case 'FOLDER_MEMBERSHIP_CHANGED': {
        const { filePaths, folderId, operation } = action.payload;
        const folderMembership = { ...state.folderMembership };
        
        filePaths.forEach(filePath => {
          if (!folderMembership[filePath]) {
            folderMembership[filePath] = [];
          }
          
          const folders = [...folderMembership[filePath]];
          if (operation === 'add' && !folders.includes(folderId)) {
            folders.push(folderId);
          } else if (operation === 'remove') {
            const index = folders.indexOf(folderId);
            if (index > -1) folders.splice(index, 1);
          }
          folderMembership[filePath] = folders;
        });
        
        return { ...state, folderMembership };
      }

      case 'UI_SET_SELECTED': {
        return {
          ...state,
          ui: { ...state.ui, selectedGames: [...action.payload] }
        };
      }

      case 'UI_SET_DRAG_STATE': {
        return {
          ...state,
          ui: { ...state.ui, dragState: action.payload }
        };
      }

      case 'UI_SET_SEARCH_TERM': {
        return {
          ...state,
          ui: { ...state.ui, searchTerm: action.payload }
        };
      }

      case 'UI_SET_LOADING': {
        return {
          ...state,
          ui: { ...state.ui, loading: action.payload }
        };
      }

      case 'FOLDERS_LOADED': {
        const folders = new Map();
        action.payload.forEach(folder => folders.set(folder.id, folder));
        return { ...state, folders };
      }

      default:
        return state;
    }
  }

  // Notify all listeners of state change
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (e) {
        console.warn('[GameStore] Listener error:', e);
      }
    });
  }

  // Selectors: efficient data access
  getGames() {
    return this.state.games;
  }

  getGamesByFolder(folderId) {
    return this.state.games.filter(game => {
      const folders = this.state.folderMembership[game.filePath];
      return folders && folders.includes(folderId);
    });
  }

  getUncategorizedGames() {
    return this.state.games.filter(game => {
      const folders = this.state.folderMembership[game.filePath];
      return !folders || folders.length === 0;
    });
  }

  getFilteredGames(searchTerm = '') {
    const games = this.state.games;
    if (!searchTerm) return games;
    
    const term = searchTerm.toLowerCase();
    return games.filter(game => 
      game.gameName?.toLowerCase().includes(term) ||
      game.vendor?.toLowerCase().includes(term)
    );
  }

  // Action creators
  static actions = {
    loadGames: (games) => ({ type: 'GAMES_LOADED', payload: games }),
    
    incrementalUpdate: (changes) => ({ 
      type: 'GAMES_INCREMENTAL_UPDATE', 
      payload: changes 
    }),
    
    folderMembershipChanged: (filePaths, folderId, operation) => ({
      type: 'FOLDER_MEMBERSHIP_CHANGED',
      payload: { filePaths, folderId, operation }
    }),
    
    setSelected: (filePaths) => ({ type: 'UI_SET_SELECTED', payload: filePaths }),
    
    setDragState: (dragState) => ({ type: 'UI_SET_DRAG_STATE', payload: dragState }),
    
    setSearchTerm: (term) => ({ type: 'UI_SET_SEARCH_TERM', payload: term }),
    
    setLoading: (loading) => ({ type: 'UI_SET_LOADING', payload: loading }),
    
    loadFolders: (folders) => ({ type: 'FOLDERS_LOADED', payload: folders })
  };
}

// Singleton instance
let storeInstance = null;

function getGameStore() {
  if (!storeInstance) {
    storeInstance = new GameStore();
  }
  return storeInstance;
}

export { GameStore, getGameStore };
