import React, { useEffect, useMemo, useState } from 'react';
import ModalWithFooter from '../ModalWithFooter.jsx';
import '../../DirectoryManager.css';
import { useTranslation } from '@hooks/useTranslation';

/**
 * ConflictResolveDialog
 * - 顯示恢復規劃的衝突詳情，並提供行為選擇
 *
 * Props
 * - isOpen: boolean
 * - plan: { decision, intersectPaths?: string[], localNewerPaths?: string[] }
 * - groups: string[] (已選的群組，用於提示)
 * - onProceed: (opts: { force: boolean }) => Promise<void> | void
 * - onClose: () => void
 */
export default function ConflictResolveDialog({ isOpen, plan, groups = [], onProceed, onClose }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const intersect = useMemo(() => plan?.intersectPaths || [], [plan]);
  const localNewer = useMemo(() => plan?.localNewerPaths || [], [plan]);
  const remoteNewer = useMemo(() => plan?.remoteNewerPaths || [], [plan]);
  const md5Different = useMemo(() => plan?.md5Different || [], [plan]);
  const md5Equal = useMemo(() => plan?.md5Equal || [], [plan]);
  const details = useMemo(() => plan?.details || [], [plan]);
  // Only show inconsistent statuses in details: exclude ignored and equal
  const detailsInconsistent = useMemo(
    () => details.filter((d) => !d.ignored && (!d.sameMd5 || d.localNewer || d.remoteNewer)),
    [details]
  );
  const remoteMeta = plan?.meta?.remote || null;
  const candidates = useMemo(
    () => details.filter((d) => !d.ignored && !d.sameMd5).map((d) => d.path),
    [details]
  );
  const [selected, setSelected] = useState([]);
  const allSelected = selected.length > 0 && selected.length === candidates.length;
  const toggleAll = (v) => {
    setSelected(v ? [...candidates] : []);
  };
  const toggleOne = (p) => {
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };
  useEffect(() => {
    // default select all candidates when plan changes/opened
    setSelected(candidates);
  }, [candidates]);

  const handleProceed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onProceed?.({ force: true, includePaths: selected });
    } finally {
      setBusy(false);
    }
  };
  const handleKeepLocal = () => {
    if (busy) return;
    onClose?.();
  };

  const footer = (
    <>
      <div className="directory-stats">{t('sync.conflict.stats')}</div>
      <div className="flex gap-8 push-right">
        <button className="btn soft-hover" disabled={busy} onClick={handleKeepLocal}>
          {t('sync.conflict.keepLocal')}
        </button>
        <button className="btn soft-hover" disabled={busy} onClick={onClose}>
          {t('app.cancel')}
        </button>
        <button
          className="btn btn-danger"
          disabled={busy || selected.length === 0}
          onClick={handleProceed}
        >
          {t('sync.conflict.coverRemote')}（{selected.length}）
        </button>
      </div>
    </>
  );

  return (
    <ModalWithFooter
      isOpen={!!isOpen}
      onClose={onClose}
      title={<span>{t('sync.conflict.title')}</span>}
      size="lg"
      footer={footer}
    >
      <div className="conflict-dialog card card-muted p-12 mb-12">
        <p className="mb-8">
          {t('sync.conflict.msg1')}
          <br />
          {t('sync.conflict.msg2')}
        </p>
        {remoteMeta && (
          <div className="text-muted mb-8">
            {t('sync.conflict.remoteMeta')}
            <code className="ml-4">{remoteMeta.backupId || '—'}</code>
            <span className="ml-8">
              {t('sync.conflict.remoteMetaTime')}:{' '}
              {remoteMeta.createdAt ? new Date(remoteMeta.createdAt).toLocaleString() : '—'}
            </span>
          </div>
        )}
        {groups?.length > 0 && (
          <p className="text-muted mb-8">
            {t('sync.conflict.groups')}: {groups.join(', ')}
          </p>
        )}
      </div>

      <div className="grid-2 gap-12 conflict-dialog">
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">{t('sync.conflict.intersect')}</div>
          {intersect.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${intersect.length > 5 ? 'limited' : ''}`}>
              {intersect.map((p) => (
                <span className="chip" key={p}>
                  <code>{p}</code>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">{t('sync.conflict.localNewer')}</div>
          {localNewer.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${localNewer.length > 5 ? 'limited' : ''}`}>
              {localNewer.map((p) => (
                <span className="chip" key={p}>
                  <code>{p}</code>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2 gap-12 mt-12 conflict-dialog">
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">{t('sync.conflict.md5Different')}</div>
          {md5Different.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${md5Different.length > 5 ? 'limited' : ''}`}>
              {md5Different.map((p) => (
                <span className="chip" key={p}>
                  <code>{p}</code>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">{t('sync.conflict.remoteNewer')}</div>
          {remoteNewer.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${remoteNewer.length > 5 ? 'limited' : ''}`}>
              {remoteNewer.map((p) => (
                <span className="chip" key={p}>
                  <code>{p}</code>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-muted p-12 mb-12 mt-12 conflict-dialog">
        <div className="card-title">{t('sync.conflict.details')}</div>
        {detailsInconsistent.length === 0 ? (
          <div className="text-muted">—</div>
        ) : (
          <div className={`table-like ${detailsInconsistent.length > 5 ? 'limited' : ''}`}>
            <div className="row header">
              <div className="cell">{t('sync.conflict.path')}</div>
              <div className="cell">{t('sync.conflict.localMD5')}</div>
              <div className="cell">{t('sync.conflict.remoteMD5')}</div>
              <div className="cell">{t('sync.conflict.localMTime')}</div>
              <div className="cell">{t('sync.conflict.remoteMTime')}</div>
              <div className="cell">{t('sync.conflict.statustitle')}</div>
            </div>
            {detailsInconsistent.map((d) => (
              <div className="row" key={d.path}>
                <div className="cell">
                  <code>{d.path}</code>
                </div>
                <div className="cell">
                  <code>{(d.local?.md5 || '').slice(0, 8)}</code>
                </div>
                <div className="cell">
                  <code>{(d.remote?.md5 || '').slice(0, 8)}</code>
                </div>
                <div className="cell">{d.local?.mtime || 0}</div>
                <div className="cell">{d.remote?.mtime || 0}</div>
                <div className="cell text-muted">
                  {d.ignored
                    ? t('sync.conflict.ignore')
                    : d.sameMd5
                      ? t('sync.conflict.sameMd5')
                      : d.localNewer
                        ? t('sync.conflict.localNewer')
                        : d.remoteNewer
                          ? t('sync.conflict.remoteNewer')
                          : '不同'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示移除：config.yml 現已參與衝突檢測，若需忽略可在 config.yml 設定 backup.ignoreConfigYml: true */}

      <div className="card card-muted p-12 mb-12 mt-12">
        <div className="card-title">{t('sync.conflict.selectCover')}</div>
        {candidates.length === 0 ? (
          <div className="text-muted">{t('sync.conflict.nothingToCover')}</div>
        ) : (
          <>
            <div className="mb-8 flex items-center gap-12">
              <label className="flex items-center gap-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
                <span>
                  {t('sync.conflict.selectAll')}（{selected.length}/{candidates.length}）
                </span>
              </label>
            </div>
            <div className="select-list" role="list">
              {candidates.map((p) => (
                <div role="listitem" key={p} className="row flex items-center gap-8 mb-6">
                  <input
                    type="checkbox"
                    checked={selected.includes(p)}
                    onChange={() => toggleOne(p)}
                  />
                  <span className="chip">
                    <code>{p}</code>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalWithFooter>
  );
}
