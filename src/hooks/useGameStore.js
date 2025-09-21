// src/hooks/useGameStore.js
// React hook for GameStore integration with main process bridge

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getGameStore } from '../store/GameStore';

let gameStore = null;

// Lazy load store to avoid circular dependencies
function getStore() {
  if (!gameStore) {
    gameStore = getGameStore();
  }
  return gameStore;
}

// Main hook for accessing store state
export function useGameStore(selector) {
  const store = getStore();
  const [state, setState] = useState(() =>
    selector ? selector(store.getState()) : store.getState()
  );

  useEffect(() => {
    const unsubscribe = store.subscribe((newState) => {
      const selectedState = selector ? selector(newState) : newState;
      setState(selectedState);
    });

    // Listen for main process store updates
    const handleStoreSync = (event, data) => {
      if (data.type === 'FULL_SYNC') {
        store.dispatch({ type: 'GAMES_LOADED', payload: data.payload.games });
        // Handle folder membership sync
        data.payload.folderMembership.forEach(({ filePath, folderId }) => {
          store.dispatch({
            type: 'FOLDER_MEMBERSHIP_CHANGED',
            payload: { filePaths: [filePath], folderId, operation: 'add' },
          });
        });
      }
    };

    const handleStoreAction = (event, action) => {
      store.dispatch(action);
    };

    // Register IPC listeners
    if (window.electronAPI) {
      window.electronAPI.on?.('store-sync', handleStoreSync);
      window.electronAPI.on?.('store-action', handleStoreAction);
    }

    return () => {
      unsubscribe();
      if (window.electronAPI) {
        window.electronAPI.removeListener?.('store-sync', handleStoreSync);
        window.electronAPI.removeListener?.('store-action', handleStoreAction);
      }
    };
  }, [store, selector]);

  const dispatch = useCallback(
    (action) => {
      store.dispatch(action);
    },
    [store]
  );

  return [state, dispatch];
}

// Specialized hooks for common use cases
export function useGames(searchTerm = '') {
  const selector = useCallback(
    (state) => {
      // state.games is already an array, not a Map
      const games = Array.isArray(state.games) ? state.games : [];
      // 過濾無效遊戲物件
      const validGames = games.filter((game) => game && game.filePath);

      if (!searchTerm) return validGames;

      const term = searchTerm.toLowerCase();
      return validGames.filter(
        (game) =>
          game.gameName?.toLowerCase().includes(term) || game.vendor?.toLowerCase().includes(term)
      );
    },
    [searchTerm]
  );

  const [games] = useGameStore(selector);
  return games;
}

export function useGamesByFolder(folderId) {
  const selector = useCallback(
    (state) => {
      const games = Array.isArray(state.games) ? state.games : [];
      return games.filter((game) => {
        if (!game || !game.filePath) return false;
        const folders = state.folderMembership[game.filePath];
        return folders && folders.includes(folderId);
      });
    },
    [folderId]
  );

  const [games] = useGameStore(selector);
  return games;
}

export function useUncategorizedGames() {
  const selector = useCallback((state) => {
    const games = Array.isArray(state.games) ? state.games : [];
    return games.filter((game) => {
      if (!game || !game.filePath) return false;
      const folders = state.folderMembership[game.filePath];
      return !folders || folders.length === 0;
    });
  }, []);

  const [games] = useGameStore(selector);
  return games;
}

export function useSelectedGames() {
  const selector = useCallback((state) => state.ui.selectedGames, []);
  const [selectedGames, dispatch] = useGameStore(selector);

  const setSelected = useCallback(
    (filePaths) => {
      const store = getStore();
      dispatch(store.constructor.actions.setSelected(filePaths));
    },
    [dispatch]
  );

  return [selectedGames, setSelected];
}

export function useDragState() {
  const selector = useCallback((state) => state.ui.dragState, []);
  const [dragState, dispatch] = useGameStore(selector);

  const setDragState = useCallback(
    (newDragState) => {
      const store = getStore();
      dispatch(store.constructor.actions.setDragState(newDragState));
    },
    [dispatch]
  );

  return [dragState, setDragState];
}

export function useSearchTerm() {
  const selector = useCallback((state) => state.ui.searchTerm, []);
  const [searchTerm, dispatch] = useGameStore(selector);

  const setSearchTerm = useCallback(
    (term) => {
      const store = getStore();
      dispatch(store.constructor.actions.setSearchTerm(term));
    },
    [dispatch]
  );

  return [searchTerm, setSearchTerm];
}

export function useLoading() {
  const selector = useCallback((state) => state.ui.loading, []);
  const [loading, dispatch] = useGameStore(selector);

  const setLoading = useCallback(
    (isLoading) => {
      const store = getStore();
      dispatch(store.constructor.actions.setLoading(isLoading));
    },
    [dispatch]
  );

  return [loading, setLoading];
}

// Actions hook for dispatching
export function useGameActions() {
  const store = getStore();

  return useMemo(
    () => ({
      loadGames: (games) => store.dispatch(store.constructor.actions.loadGames(games)),
      incrementalUpdate: (changes) =>
        store.dispatch(store.constructor.actions.incrementalUpdate(changes)),
      folderMembershipChanged: (filePaths, folderId, operation) =>
        store.dispatch(
          store.constructor.actions.folderMembershipChanged(filePaths, folderId, operation)
        ),
      setSelected: (filePaths) => store.dispatch(store.constructor.actions.setSelected(filePaths)),
      setDragState: (dragState) =>
        store.dispatch(store.constructor.actions.setDragState(dragState)),
      setSearchTerm: (term) => store.dispatch(store.constructor.actions.setSearchTerm(term)),
      setLoading: (loading) => store.dispatch(store.constructor.actions.setLoading(loading)),
      loadFolders: (folders) => store.dispatch(store.constructor.actions.loadFolders(folders)),
    }),
    [store]
  );
}
