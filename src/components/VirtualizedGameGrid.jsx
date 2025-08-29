// src/components/VirtualizedGameGrid.jsx
// Ultimate performance: React Window virtualization for massive game lists

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGamesByFolder, useSelectedGames, useDragState } from '../hooks/useGameStore';

// Lazy load react-window to handle missing dependency gracefully
let Grid = null;
try {
  const ReactWindow = require('react-window');
  Grid = ReactWindow.FixedSizeGrid;
} catch (e) {
  console.warn('[VirtualizedGameGrid] react-window not installed, falling back to regular grid');
}

const CARD_WIDTH = 180;
const CARD_HEIGHT = 240;
const GAP = 16;

// Memoized game card component
const GameCard = React.memo(({ game, isSelected, onSelect, onLaunch, onContextMenu, style }) => {
  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (e.detail === 2) { // Double click
      onLaunch?.(game);
    } else {
      onSelect?.(game, e);
    }
  }, [game, onLaunch, onSelect]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu?.(game, e);
  }, [game, onContextMenu]);

  return (
    <div 
      style={style}
      className={`game-card ${isSelected ? 'selected' : ''}`}
      data-filepath={game.filePath}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="game-card-inner">
        <div className="game-icon">
          {game.iconUrl ? (
            <img src={game.iconUrl} alt={game.gameName} loading="lazy" />
          ) : (
            <div className="default-icon">🎮</div>
          )}
        </div>
        <div className="game-info">
          <div className="game-name" title={game.gameName}>
            {game.gameName}
          </div>
          <div className="game-vendor" title={game.vendor}>
            {game.vendor}
          </div>
        </div>
      </div>
    </div>
  );
});

// Grid cell renderer
const Cell = React.memo(({ columnIndex, rowIndex, style, data }) => {
  const { 
    games, 
    columnsPerRow, 
    selectedGames, 
    onGameSelect, 
    onGameLaunch, 
    onGameContextMenu 
  } = data;
  
  const gameIndex = rowIndex * columnsPerRow + columnIndex;
  const game = games[gameIndex];
  
  if (!game) {
    return <div style={style} />;
  }
  
  const isSelected = selectedGames.has(game.filePath);
  
  // Add padding to cell style
  const cellStyle = {
    ...style,
    padding: GAP / 2,
    left: style.left + GAP / 2,
    top: style.top + GAP / 2,
    width: style.width - GAP,
    height: style.height - GAP
  };
  
  return (
    <GameCard
      game={game}
      isSelected={isSelected}
      onSelect={onGameSelect}
      onLaunch={onGameLaunch}
      onContextMenu={onGameContextMenu}
      style={cellStyle}
    />
  );
});

// Error boundary for virtualized grid
class VirtualizedGridErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[VirtualizedGameGrid] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="virtualized-grid-error">
          <div className="error-icon">⚠️</div>
          <div className="error-text">虛擬化網格載入失敗</div>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            重試
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Fallback regular grid when react-window is not available
const RegularGrid = ({ games, selectedGames, onGameSelect, onGameLaunch, onGameContextMenu }) => {
  return (
    <div className="regular-grid-container">
      {games.map(game => (
        <GameCard
          key={game.filePath}
          game={game}
          isSelected={selectedGames.includes(game.filePath)}
          onSelect={onGameSelect}
          onLaunch={onGameLaunch}
          onContextMenu={onGameContextMenu}
          style={{}}
        />
      ))}
    </div>
  );
};

const VirtualizedGameGrid = ({ 
  folderId,
  onGameLaunch,
  onGameSelect,
  onGameContextMenu,
  containerWidth = 800,
  containerHeight = 600
}) => {
  const games = useGamesByFolder(folderId);
  const [selectedGames] = useSelectedGames();
  const [dragState] = useDragState();
  
  // Handle container resize
  const [dimensions, setDimensions] = useState({ width: containerWidth, height: containerHeight });
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    let resizeObserver;
    try {
      resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      });
      
      resizeObserver.observe(containerRef.current);
    } catch (e) {
      console.warn('[VirtualizedGameGrid] ResizeObserver not supported');
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);
  
  // Empty state
  if (games.length === 0) {
    return (
      <div ref={containerRef} className="virtualized-grid-container">
        <div className="empty-folder">
          <div className="empty-icon">📂</div>
          <div className="empty-text">此資料夾目前沒有遊戲</div>
        </div>
      </div>
    );
  }

  // Fallback to regular grid if react-window is not available
  if (!Grid) {
    return (
      <VirtualizedGridErrorBoundary>
        <div ref={containerRef} className="virtualized-grid-container">
          <RegularGrid
            games={games}
            selectedGames={selectedGames}
            onGameSelect={onGameSelect}
            onGameLaunch={onGameLaunch}
            onGameContextMenu={onGameContextMenu}
          />
        </div>
      </VirtualizedGridErrorBoundary>
    );
  }
  
  // Calculate grid dimensions
  const columnsPerRow = Math.floor((dimensions.width - GAP) / (CARD_WIDTH + GAP));
  const rowCount = Math.ceil(games.length / columnsPerRow);
  
  // Grid item data
  const itemData = useMemo(() => ({
    games,
    columnsPerRow,
    selectedGames,
    onGameSelect,
    onGameLaunch,
    onGameContextMenu
  }), [games, columnsPerRow, selectedGames, onGameSelect, onGameLaunch, onGameContextMenu]);
  
  return (
    <VirtualizedGridErrorBoundary>
      <div ref={containerRef} className="virtualized-grid-container">
        <Grid
          columnCount={columnsPerRow}
          columnWidth={CARD_WIDTH + GAP}
          height={dimensions.height}
          rowCount={rowCount}
          rowHeight={CARD_HEIGHT + GAP}
          width={dimensions.width}
          itemData={itemData}
          overscanRowCount={2}
          overscanColumnCount={2}
        >
          {Cell}
        </Grid>
      </div>
    </VirtualizedGridErrorBoundary>
  );
};

export default VirtualizedGameGrid;
