import React from 'react';

/**
 * ProgressPanel - 通用進度條面板
 *
 * 設計目標：
 * - 通用 UI，資料由外層組件決定（掃描、備份/還原、其他長任務）
 * - 不耦合 i18n，直接接收字串/節點
 * - 自動計算百分比（優先使用 props.percent，其次用 done/total 計算）
 * - 靈活顯示：status（左側文字）、countText（右側文字，可選）、current（下一行當前項目）
 */
export default function ProgressPanel({
  title = 'Progress',
  done = 0,
  total = 0,
  percent, // 可直接指定 0-100，否則用 done/total 計算
  status, // 左側狀態文字（例如：狀態：上傳中）
  countText, // 右側文字（例如：12 / 123），若未提供且 total>0 則顯示 done/total
  current, // 顯示於下一行的細節（例如：當前：xxx）
  className = '',
}) {
  const pct = (() => {
    if (typeof percent === 'number' && isFinite(percent)) {
      return Math.max(0, Math.min(100, Math.round(percent)));
    }
    const t = Number(total || 0);
    const d = Number(done || 0);
    if (!t) return 0;
    const v = Math.max(0, Math.min(1, d / t));
    return Math.round(v * 100);
  })();

  const showCount = (() => {
    if (typeof countText === 'string' && countText.length > 0) return true;
    if (Number(total) > 0) return true;
    return false;
  })();

  const rightText = (() => {
    if (typeof countText === 'string' && countText.length > 0) return countText;
    if (Number(total) > 0) return `${Number(done || 0)} / ${Number(total || 0)}`;
    return '';
  })();

  return (
    <div className={`card card-muted p-12 ${className}`}>
      {title ? <div className="card-title">{title}</div> : null}
      {/* 外框 */}
      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 6,
          background: 'var(--overlay-on-light-12)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct > 0 ? Math.max(2, pct) : 0}%`, // 大於 0% 時最少顯示細條
            background: 'linear-gradient(90deg, rgba(87,161,255,0.9), rgba(87,161,255,0.6))',
            transform: 'translateZ(0)', // GPU-friendly
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
      {(status || showCount) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          <div>{status || ''}</div>
          {showCount ? <div>{rightText}</div> : <div />}
        </div>
      )}
      {current ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            opacity: 0.8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {current}
        </div>
      ) : null}
    </div>
  );
}
