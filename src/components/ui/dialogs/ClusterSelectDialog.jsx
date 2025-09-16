import React, { useEffect, useMemo, useState } from 'react';
import ModalWithFooter from '../ModalWithFooter';
import { useTranslation } from '@hooks/useTranslation';

/**
 * ClusterSelectDialog
 * - 極簡簇選擇對話框：支援搜索與點選
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - onSelect: (cluster) => void  // 選擇後回傳整個簇物件（含 id, name 等）
 */
export default function ClusterSelectDialog({ isOpen, onClose, onSelect, folderId = null, excludeIds = [] }) {
  const { t } = useTranslation();
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        let res;
        if (folderId != null) {
          res = await window.electronAPI?.getClustersByFolder?.(folderId);
        } else {
          res = await window.electronAPI?.getDesktopClusters?.();
        }
        if (!mounted) return;
        setClusters(Array.isArray(res?.clusters) ? res.clusters : []);
      } catch (e) {
        console.error('[ClusterSelectDialog] 載入簇失敗:', e);
        if (mounted) setClusters([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [isOpen, folderId]);

  const filtered = useMemo(() => {
    const k = (q || '').trim().toLowerCase();
    const exclude = new Set(Array.isArray(excludeIds) ? excludeIds : []);
    const base = clusters.filter(c => !exclude.has(c.id));
    if (!k) return base;
    return base.filter(c => (c.name || '').toLowerCase().includes(k));
  }, [q, clusters, excludeIds]);

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ fontWeight: 600 }}>{t('app.select')}</div>
    </div>
  );

  const footer = (
    <div className="flex gap-8 push-right">
      <button className="btn btn-secondary" onClick={onClose}>{t('app.cancel')}</button>
    </div>
  );

  return (
    <ModalWithFooter
      isOpen={!!isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={footer}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="form-row" style={{ margin: 0 }}>
          <input
            className="form-input"
            placeholder={t('searchClusters')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {loading ? (
            <div style={{ padding: 12, opacity: 0.8 }}>{t('app.loading')}</div>
          ) : (filtered.length === 0 ? (
            <div style={{ padding: 12, opacity: 0.8 }}>{t('app.noClusters')}</div>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                onClick={() => onSelect && onSelect(c)}
                className="hoverable-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderBottom: '1px solid var(--dialog-border)',
                  cursor: 'pointer'
                }}
                title={`選擇簇：${c.name}`}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: 'var(--overlay-on-light-08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={c.iconUrl || '/icon.ico'} alt="cluster" style={{ width: 32, height: 32, objectFit: 'cover' }} draggable={false} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || '未命名簇'}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{t('app.member')}: {c.memberCount ?? 0}</div>
                </div>
                <div>
                  <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onSelect && onSelect(c); }}>✔</button>
                </div>
              </div>
            ))
          ))}
        </div>
      </div>
    </ModalWithFooter>
  );
}
