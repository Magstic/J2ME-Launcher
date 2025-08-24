import React, { useEffect, useMemo, useState } from 'react';
import ModalWithFooter from '../ModalWithFooter.jsx';
import '../../DirectoryManager.css';

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
  const [busy, setBusy] = useState(false);

  const intersect = useMemo(() => plan?.intersectPaths || [], [plan]);
  const localNewer = useMemo(() => plan?.localNewerPaths || [], [plan]);
  const remoteNewer = useMemo(() => plan?.remoteNewerPaths || [], [plan]);
  const md5Different = useMemo(() => plan?.md5Different || [], [plan]);
  const md5Equal = useMemo(() => plan?.md5Equal || [], [plan]);
  const details = useMemo(() => plan?.details || [], [plan]);
  // Only show inconsistent statuses in details: exclude ignored and equal
  const detailsInconsistent = useMemo(
    () => details.filter(d => !d.ignored && (!d.sameMd5 || d.localNewer || d.remoteNewer)),
    [details]
  );
  const remoteMeta = plan?.meta?.remote || null;
  const candidates = useMemo(() => details.filter(d => !d.ignored && !d.sameMd5).map(d => d.path), [details]);
  const [selected, setSelected] = useState([]);
  const allSelected = selected.length > 0 && selected.length === candidates.length;
  const toggleAll = (v) => {
    setSelected(v ? [...candidates] : []);
  };
  const toggleOne = (p) => {
    setSelected((prev) => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
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
      <div className="directory-stats">
        偵測到本地與雲端在同一路徑存在差異，建議確認後再覆蓋。
      </div>
      <div className="flex gap-8 push-right">
        <button className="btn soft-hover" disabled={busy} onClick={handleKeepLocal}>保留本地版本</button>
        <button className="btn soft-hover" disabled={busy} onClick={onClose}>取消</button>
        <button className="btn btn-danger" disabled={busy || selected.length === 0} onClick={handleProceed}>覆蓋為雲端版本（{selected.length}）</button>
      </div>
    </>
  );

  return (
    <ModalWithFooter
      isOpen={!!isOpen}
      onClose={onClose}
      title={<span>同步衝突</span>}
      size="lg"
      footer={footer}
    >
      <div className="conflict-dialog card card-muted p-12 mb-12">
        <p className="mb-8">
          您在本地的檔案版本新於雲端版本。<br/>
          若選擇『覆蓋為雲端版本』，將以雲端版本覆蓋本地檔案。
        </p>
        {remoteMeta && (
          <div className="text-muted mb-8">
            雲端快照：
            <code className="ml-4">{remoteMeta.backupId || '—'}</code>
            <span className="ml-8">建立時間：{remoteMeta.createdAt ? new Date(remoteMeta.createdAt).toLocaleString() : '—'}</span>
          </div>
        )}
        {groups?.length > 0 && (
          <p className="text-muted mb-8">本次選擇的內容群組：{groups.join(', ')}</p>
        )}
      </div>

      <div className="grid-2 gap-12 conflict-dialog">
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">交集檔案</div>
          {intersect.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${intersect.length > 5 ? 'limited' : ''}`}>
              {intersect.map((p) => (
                <span className="chip" key={p}><code>{p}</code></span>
              ))}
            </div>
          )}
        </div>
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">本地較新</div>
          {localNewer.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${localNewer.length > 5 ? 'limited' : ''}`}>
              {localNewer.map((p) => (
                <span className="chip" key={p}><code>{p}</code></span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2 gap-12 mt-12 conflict-dialog">
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">雜湊相異</div>
          {md5Different.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${md5Different.length > 5 ? 'limited' : ''}`}>
              {md5Different.map((p) => (
                <span className="chip" key={p}><code>{p}</code></span>
              ))}
            </div>
          )}
        </div>
        <div className="card card-muted p-12 mb-12">
          <div className="card-title">雲端較新</div>
          {remoteNewer.length === 0 ? (
            <div className="text-muted">—</div>
          ) : (
            <div className={`chips ${remoteNewer.length > 5 ? 'limited' : ''}`}>
              {remoteNewer.map((p) => (
                <span className="chip" key={p}><code>{p}</code></span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-muted p-12 mb-12 mt-12 conflict-dialog">
        <div className="card-title">檔案詳情</div>
        {detailsInconsistent.length === 0 ? (
          <div className="text-muted">—</div>
        ) : (
          <div className={`table-like ${detailsInconsistent.length > 5 ? 'limited' : ''}`}>
            <div className="row header">
              <div className="cell">路徑</div>
              <div className="cell">本地 MD5</div>
              <div className="cell">雲端 MD5</div>
              <div className="cell">本地 MTime</div>
              <div className="cell">雲端 MTime</div>
              <div className="cell">狀態</div>
            </div>
            {detailsInconsistent.map((d) => (
              <div className="row" key={d.path}>
                <div className="cell"><code>{d.path}</code></div>
                <div className="cell"><code>{(d.local?.md5 || '').slice(0,8)}</code></div>
                <div className="cell"><code>{(d.remote?.md5 || '').slice(0,8)}</code></div>
                <div className="cell">{d.local?.mtime || 0}</div>
                <div className="cell">{d.remote?.mtime || 0}</div>
                <div className="cell text-muted">
                  {d.ignored ? '忽略' : d.sameMd5 ? '一致' : d.localNewer ? '本地較新' : d.remoteNewer ? '雲端較新' : '不同'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示移除：config.yml 現已參與衝突檢測，若需忽略可在 config.yml 設定 backup.ignoreConfigYml: true */}

      <div className="card card-muted p-12 mb-12 mt-12">
        <div className="card-title">選擇要覆蓋的檔案</div>
        {candidates.length === 0 ? (
          <div className="text-muted">沒有需要處理的差異（皆為忽略或內容一致）。</div>
        ) : (
          <>
            <div className="mb-8 flex items-center gap-12">
              <label className="flex items-center gap-8">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
                <span>全選（{selected.length}/{candidates.length}）</span>
              </label>
            </div>
            <div className="select-list" role="list">
              {candidates.map((p) => (
                <div role="listitem" key={p} className="row flex items-center gap-8 mb-6">
                  <input type="checkbox" checked={selected.includes(p)} onChange={() => toggleOne(p)} />
                  <span className="chip"><code>{p}</code></span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalWithFooter>
  );
}
