// 控制器按鍵綁定與阈值配置（模塊化導出）
// 參考 Xbox/PS 通用映射：Chromium Standard Gamepad Mapping

export const controllerBindings = {
  // 按鈕索引對應（部分手把可能略有差異）
  buttons: {
    A: 0,           // 啟動
    B: 1,           // 返回 / 取消
    X: 2,           // 資訊
    Y: 3,           // 配置
    LB: 4,          // 上一頁
    RB: 5,          // 下一頁
    Select: 8,      // 聚焦搜尋
    Start: 9,       // 切換模式（可選）
    DPadUp: 12,
    DPadDown: 13,
    DPadLeft: 14,
    DPadRight: 15,
  },
  axes: {
    LX: 0, // 左搖桿 X
    LY: 1, // 左搖桿 Y
  },
  thresholds: {
    stick: 0.3,     // 搖桿死區
    repeatInitial: 400, // 首次按住重複延遲（ms）
    repeatRate: 400,    // 連續重複間隔（ms）
  },
};

export default controllerBindings;
