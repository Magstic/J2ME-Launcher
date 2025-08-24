import React, { createContext, useContext, useReducer, useCallback } from 'react';

/**
 * 拖拽狀態管理
 */
const DragContext = createContext();

// 拖拽狀態
const initialState = {
  isDragging: false,
  draggedItem: null,
  draggedType: null, // 'game' | 'folder'
  draggedFrom: null, // 來源位置信息
  dropTarget: null,
  dropZones: [], // 可放置區域列表
  dragPosition: { x: 0, y: 0 }
};

// 拖拽動作
const dragActions = {
  START_DRAG: 'START_DRAG',
  UPDATE_DRAG: 'UPDATE_DRAG',
  SET_DROP_TARGET: 'SET_DROP_TARGET',
  END_DRAG: 'END_DRAG',
  REGISTER_DROP_ZONE: 'REGISTER_DROP_ZONE',
  UNREGISTER_DROP_ZONE: 'UNREGISTER_DROP_ZONE'
};

// 拖拽狀態 reducer
const dragReducer = (state, action) => {
  switch (action.type) {
    case dragActions.START_DRAG:
      return {
        ...state,
        isDragging: true,
        draggedItem: action.payload.item,
        draggedType: action.payload.type,
        draggedFrom: action.payload.from,
        dropTarget: null,
        dragPosition: action.payload.position || { x: 0, y: 0 }
      };

    case dragActions.UPDATE_DRAG:
      return {
        ...state,
        dragPosition: action.payload.position
      };

    case dragActions.SET_DROP_TARGET:
      return {
        ...state,
        dropTarget: action.payload.target
      };

    case dragActions.END_DRAG:
      return {
        ...initialState,
        dropZones: state.dropZones // 保留已註冊的放置區域
      };

    case dragActions.REGISTER_DROP_ZONE:
      return {
        ...state,
        dropZones: [...state.dropZones.filter(zone => zone.id !== action.payload.id), action.payload]
      };

    case dragActions.UNREGISTER_DROP_ZONE:
      return {
        ...state,
        dropZones: state.dropZones.filter(zone => zone.id !== action.payload.id)
      };

    default:
      return state;
  }
};

/**
 * 拖拽提供者組件
 */
export const DragProvider = ({ children }) => {
  const [state, dispatch] = useReducer(dragReducer, initialState);

  // 開始拖拽
  const startDrag = useCallback((item, type, from = null, position = null) => {
    dispatch({
      type: dragActions.START_DRAG,
      payload: { item, type, from, position }
    });
  }, []);

  // 更新拖拽位置
  const updateDrag = useCallback((position) => {
    dispatch({
      type: dragActions.UPDATE_DRAG,
      payload: { position }
    });
  }, []);

  // 設置放置目標
  const setDropTarget = useCallback((target) => {
    dispatch({
      type: dragActions.SET_DROP_TARGET,
      payload: { target }
    });
  }, []);

  // 結束拖拽
  const endDrag = useCallback(() => {
    dispatch({
      type: dragActions.END_DRAG
    });
  }, []);

  // 註冊放置區域
  const registerDropZone = useCallback((id, element, acceptTypes, onDrop) => {
    dispatch({
      type: dragActions.REGISTER_DROP_ZONE,
      payload: { id, element, acceptTypes, onDrop }
    });
  }, []);

  // 取消註冊放置區域
  const unregisterDropZone = useCallback((id) => {
    dispatch({
      type: dragActions.UNREGISTER_DROP_ZONE,
      payload: { id }
    });
  }, []);

  // 檢查是否可以放置到目標
  const canDropOn = useCallback((targetType, targetId) => {
    if (!state.isDragging) return false;
    
    const dropZone = state.dropZones.find(zone => zone.id === targetId);
    if (!dropZone) return false;
    
    return dropZone.acceptTypes.includes(state.draggedType);
  }, [state.isDragging, state.draggedType, state.dropZones]);

  // 獲取當前拖拽的元素在指定位置下的放置目標
  const getDropTargetAt = useCallback((x, y) => {
    if (!state.isDragging) return null;
    
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    
    // 查找最近的放置區域
    let current = element;
    while (current && current !== document.body) {
      const dropZone = state.dropZones.find(zone => 
        zone.element === current || zone.element.contains(current)
      );
      
      if (dropZone && dropZone.acceptTypes.includes(state.draggedType)) {
        return dropZone;
      }
      
      current = current.parentElement;
    }
    
    return null;
  }, [state.isDragging, state.draggedType, state.dropZones]);

  const contextValue = {
    // 狀態
    ...state,
    
    // 動作
    startDrag,
    updateDrag,
    setDropTarget,
    endDrag,
    registerDropZone,
    unregisterDropZone,
    
    // 工具函數
    canDropOn,
    getDropTargetAt
  };

  return (
    <DragContext.Provider value={contextValue}>
      {children}
    </DragContext.Provider>
  );
};

/**
 * 使用拖拽上下文的 Hook
 */
export const useDrag = () => {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDrag must be used within a DragProvider');
  }
  return context;
};

/**
 * 拖拽項目 Hook
 */
export const useDragItem = (item, type, from = null) => {
  const { startDrag, endDrag, isDragging, draggedItem } = useDrag();
  
  const isDraggingThis = isDragging && draggedItem === item;
  
  const handleDragStart = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    
    // 設置拖拽數據
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({ item, type, from }));
    
    startDrag(item, type, from, position);
  }, [item, type, from, startDrag]);
  
  const handleDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);
  
  return {
    isDraggingThis,
    handleDragStart,
    handleDragEnd,
    dragProps: {
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd
    }
  };
};

/**
 * 放置區域 Hook
 */
export const useDropZone = (id, acceptTypes, onDrop) => {
  const { 
    registerDropZone, 
    unregisterDropZone, 
    canDropOn, 
    isDragging,
    draggedType,
    setDropTarget 
  } = useDrag();
  
  const elementRef = React.useRef(null);
  const isValidDropTarget = isDragging && acceptTypes.includes(draggedType);
  
  // 註冊/取消註冊放置區域
  React.useEffect(() => {
    if (elementRef.current) {
      registerDropZone(id, elementRef.current, acceptTypes, onDrop);
      return () => unregisterDropZone(id);
    }
  }, [id, acceptTypes, onDrop, registerDropZone, unregisterDropZone]);
  
  const handleDragOver = useCallback((event) => {
    if (isValidDropTarget) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(id);
    }
  }, [isValidDropTarget, setDropTarget, id]);
  
  const handleDragLeave = useCallback((event) => {
    // 只有當離開整個放置區域時才清除目標
    if (!elementRef.current?.contains(event.relatedTarget)) {
      setDropTarget(null);
    }
  }, [setDropTarget]);
  
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    
    if (isValidDropTarget) {
      try {
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        onDrop(data.item, data.type, data.from);
      } catch (error) {
        console.error('解析拖拽數據失敗:', error);
      }
    }
    
    setDropTarget(null);
  }, [isValidDropTarget, onDrop, setDropTarget]);
  
  return {
    ref: elementRef,
    isValidDropTarget,
    canDrop: canDropOn(draggedType, id),
    dropProps: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop
    }
  };
};

export default DragProvider;
