// src/components/shared/utils/itemsMemo.js
// 以鍵（G:filePath / C:id）重用物件引用，降低 VirtualizedUnifiedGrid 的重繪成本
// 提供工廠函數（無 React 依賴）與便捷 Hook（需 React）兩種用法

import { useRef, useMemo } from 'react';
import { keyOfGame, keyOfCluster } from './listEquality';

function shallowEqCluster(a, b) {
  if (!a || !b) return false;
  return (
    String(a.id) === String(b.id) &&
    (a.name || '') === (b.name || '') &&
    (a.iconUrl || '') === (b.iconUrl || '') &&
    (a.primaryFilePath || '') === (b.primaryFilePath || '') &&
    (a.memberCount ?? null) === (b.memberCount ?? null)
  );
}

function shallowEqGame(a, b) {
  if (!a || !b) return false;
  // a/b 皆為 items 形態（含 type='game' 與映射後欄位）或原始 game 物件
  const af = a.filePath || a.gameId || '';
  const bf = b.filePath || b.gameId || '';
  return (
    String(af) === String(bf) &&
    (a.gameName || '') === (b.gameName || '') &&
    (a.vendor || '') === (b.vendor || '') &&
    (a.iconUrl || '') === (b.iconUrl || '')
  );
}

/**
 * 建立一個 memoizer，跨多次 build() 調用重用 items 的物件引用
 */
export function createItemsMemoizer() {
  /** @type {Map<string, any>} */
  const prevClusters = new Map();
  /** @type {Map<string, any>} */
  const prevGames = new Map();

  const build = (games = [], clusters = []) => {
    const nextClusters = new Map();
    const nextGames = new Map();

    const clusterItems = Array.isArray(clusters)
      ? clusters.map((c) => {
          const k = keyOfCluster(c);
          const prev = prevClusters.get(k);
          if (prev && shallowEqCluster(prev, c)) {
            nextClusters.set(k, prev);
            return prev;
          }
          const item = { ...c, type: 'cluster' };
          nextClusters.set(k, item);
          return item;
        })
      : [];

    const gameItems = Array.isArray(games)
      ? games.map((g) => {
          const k = keyOfGame(g);
          const prev = prevGames.get(k);
          if (prev && shallowEqGame(prev, g)) {
            nextGames.set(k, prev);
            return prev;
          }
          const item = { ...g, type: 'game' };
          nextGames.set(k, item);
          return item;
        })
      : [];

    // 以新的映射替換舊的，釋放已不存在鍵的引用
    prevClusters.clear();
    for (const [k, v] of nextClusters) prevClusters.set(k, v);
    prevGames.clear();
    for (const [k, v] of nextGames) prevGames.set(k, v);

    return [...clusterItems, ...gameItems];
  };

  return { build };
}

/**
 * React 便捷 Hook：保留 memoizer 實例於 ref，並用 useMemo 包裝輸出
 */
export function useItemsMemo(games, clusters) {
  const memoRef = useRef(null);
  if (!memoRef.current) memoRef.current = createItemsMemoizer();
  // 僅依賴資料引用改變時重建 items；內部已針對單項重用引用
  return useMemo(() => memoRef.current.build(games, clusters), [games, clusters]);
}
