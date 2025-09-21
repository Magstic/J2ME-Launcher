import { useState, useEffect, useCallback } from 'react';
import ContextMenu from '../Desktop/ContextMenu';

// 統一的右鍵菜單 Hook（.jsx 版本，避免 JSX 在 .js 中解析錯誤）
export default function useContextMenu(callbacks = {}) {
  const [state, setState] = useState({
    isVisible: false,
    position: { x: 0, y: 0 },
    targetItem: null,
    menuType: 'desktop',
  });

  const open = useCallback((event, item = null, type = 'desktop') => {
    // 阻止預設與冒泡，避免全局 contextmenu 捕獲器立刻關閉剛剛打開的菜單（造成閃爍）
    event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    setState({
      isVisible: true,
      position: { x: event.clientX, y: event.clientY },
      targetItem: item,
      menuType: type,
    });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const Element = state.isVisible ? (
    <ContextMenu
      position={state.position}
      targetItem={state.targetItem}
      menuType={state.menuType}
      onClose={close}
      {...callbacks}
    />
  ) : null;

  return {
    contextMenu: state,
    openContextMenu: open,
    closeContextMenu: close,
    ContextMenuElement: Element,
  };
}
