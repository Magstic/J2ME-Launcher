import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../DirectoryManager.css';
import { ModalWithFooter, Select, ToggleSwitch, ModalHeaderOnly } from '@ui';
import ConflictResolveDialog from './ConflictResolveDialog.jsx';
import { useTranslation } from '@hooks/useTranslation';

// 以最低耦合的方式：調用 preload 提供的 API
const api = typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null;

const PROVIDERS = [
  { value: 'dropbox', label: 'Dropbox' },
  { value: 's3', label: 'S3 API' },
  { value: 'webdav', label: 'WebDAV' }
];

// 固定本程式的 Dropbox App Key（Client ID）
const DROPBOX_APP_KEY = 'xxxxxxxxxxxxxxxx'; // TODO: 換成自己的 App Key

export default function BackupDialog({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState('dropbox');
  const [spec, setSpec] = useState({ groups: [] });
  const [selectedGroups, setSelectedGroups] = useState({ config: true, database: true });
  const [params, setParams] = useState({}); // 各 provider 參數容器（暫留；稍後依 provider 顯示對應表單）
  const [lastBackupAt, setLastBackupAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflictPlan, setConflictPlan] = useState(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const nameRef = useRef(null);
  const [dropboxAuth, setDropboxAuth] = useState({ linked: false, clientId: null });
  const [dropboxAccount, setDropboxAccount] = useState(null);
  const [dropboxAvatar, setDropboxAvatar] = useState(null);
  // 進度狀態（總體與目前檔案）
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '', phase: 'idle' });
  // 單一確認/關閉的訊息對話框（取代內建 alert）
  const [infoDialog, setInfoDialog] = useState({ isOpen: false, title: '', message: '' });

  // 讀取規格 & 最後備份時間
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      try {
        if (!api) return;
        const s = await api.backupGetSpec();
        const meta = await api.backupGetLast();
        if (!mounted) return;
        setSpec(s || { groups: [] });
        setLastBackupAt((meta && meta.lastBackupAt) || 0);
        // 恢復本地選擇的群組
        try {
          const raw = localStorage.getItem('backup.selectedGroups');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') setSelectedGroups(parsed);
          }
        } catch (_) {}
        // 恢復 S3 設定參數
        try {
          const s3raw = localStorage.getItem('backup.s3.params');
          if (s3raw) {
            const s3 = JSON.parse(s3raw);
            if (s3 && typeof s3 === 'object') {
              setParams(prev => ({ ...prev, s3 }));
            }
          }
        } catch (_) {}
        // 讀取主進程保存的 S3 參數（若有）
        try {
          const savedS3 = await api.backupGetProviderParams('s3');
          if (mounted && savedS3 && typeof savedS3 === 'object') {
            setParams(prev => ({ ...prev, s3: { ...(prev.s3 || {}), ...savedS3 } }));
          }
        } catch (_) {}
        // 恢復 Dropbox 設定參數
        try {
          const dbxRaw = localStorage.getItem('backup.dropbox.params');
          if (dbxRaw) {
            const dropbox = JSON.parse(dbxRaw);
            if (dropbox && typeof dropbox === 'object') setParams(prev => ({ ...prev, dropbox }));
          }
        } catch (_) {}
        // 恢復 WebDAV 設定參數
        try {
          const wdRaw = localStorage.getItem('backup.webdav.params');
          if (wdRaw) {
            const webdav = JSON.parse(wdRaw);
            if (webdav && typeof webdav === 'object') setParams(prev => ({ ...prev, webdav }));
          }
        } catch (_) {}
        // 讀取主進程保存的 WebDAV 參數（若有）
        try {
          const savedWD = await api.backupGetProviderParams('webdav');
          if (mounted && savedWD && typeof savedWD === 'object') {
            setParams(prev => ({ ...prev, webdav: { ...(prev.webdav || {}), ...savedWD } }));
          }
        } catch (_) {}
        // 讀取 Dropbox 連結狀態與帳戶資訊
        try {
          const auth = await api.dropboxGetAuth();
          if (mounted && auth) setDropboxAuth(auth);
          if (auth && auth.linked) {
            const acct = await api.dropboxGetAccount();
            if (mounted) setDropboxAccount(acct || null);
            if (acct && acct.profile_photo_url) {
              try {
                const dataUrl = await api.dropboxGetAccountPhoto(acct.profile_photo_url);
                if (mounted) setDropboxAvatar(dataUrl || null);
              } catch (_) { if (mounted) setDropboxAvatar(null); }
            } else {
              setDropboxAvatar(null);
            }
          } else {
            setDropboxAccount(null);
            setDropboxAvatar(null);
          }
        } catch (_) { setDropboxAccount(null); }
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, [isOpen]);

  // 訂閱後端備份進度事件（開啟對話框時才訂閱，關閉時移除）
  useEffect(() => {
    if (!isOpen || !api) return;
    const off = api.onBackupProgress?.((payload) => {
      if (!payload || typeof payload !== 'object') return;
      setProgress((prev) => {
        // 根據事件類型更新整體進度
        if (payload.type === 'upload-progress') {
          return { ...prev, current: payload.rel || prev.current, phase: 'uploading' };
        }
        if (payload.type === 'upload-done') {
          const done = Number(payload.done || 0);
          const total = Number(payload.total || prev.total || 0);
          return { done, total, current: payload.rel || prev.current, phase: 'uploading' };
        }
        if (payload.type === 'delete') {
          return { ...prev, current: payload.rel || prev.current, phase: 'deleting' };
        }
        if (payload.type === 'error') {
          return { ...prev, phase: 'error', current: payload.rel || prev.current };
        }
        return prev;
      });
    });
    return () => { try { off && off(); } catch (_) {} };
  }, [isOpen]);

  const formattedLastTime = useMemo(() => {
    if (!lastBackupAt) return '—';
    try {
      const d = new Date(lastBackupAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    } catch { return '—'; }
  }, [lastBackupAt]);

  const handleToggleGroup = (key) => (value) => {
    setSelectedGroups((prev) => {
      const next = { ...prev, [key]: !!value };
      try { localStorage.setItem('backup.selectedGroups', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  const footer = (
    <>
      {/* 左側文本：共用 DirectoryManager.css 的樣式 */}
      <div className="directory-stats">{t('sync.lastTime')}{formattedLastTime}</div>
      {/* 右側按鈕群：沿用 push-right 靠右對齊 */}
      <div className="flex gap-8 push-right">
        <button className="btn soft-hover" disabled={busy} onClick={() => runRestore()}>{t('sync.restore')}</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => runBackup('full')}>{t('sync.full')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => runBackup('incremental')}>{t('sync.incremental')}</button>
      </div>
    </>
  );

  async function runBackup(mode) {
    if (!api || busy) return;
    setBusy(true);
    // 重置進度條（開始新一輪備份）
    setProgress({ done: 0, total: 0, current: '', phase: 'planning' });
    try {
      const groups = Object.entries(selectedGroups).filter(([, v]) => v).map(([k]) => k);
      const res = await api.backupRun({ mode, provider, params: params[provider] || {}, groups });
      if (res && res.lastBackupAt) setLastBackupAt(res.lastBackupAt);
      // 若主程序返回了統計，可將總數補齊（以避免部份 provider 無法回報細節）
      if (typeof res?.uploaded === 'number') {
        setProgress((prev) => ({ ...prev, done: res.uploaded, total: Math.max(prev.total || 0, res.uploaded), phase: 'finalizing' }));
      }
    } catch (e) {
      console.error('backup failed:', e);
    } finally {
      setBusy(false);
      // 停留於完成狀態，讓使用者看見 100% 一小段時間（不立即清空）
      setTimeout(() => setProgress((p) => (p.done > 0 || p.total > 0) ? { ...p, phase: 'done' } : p), 50);
    }
  }

  async function runRestore() {
    if (!api || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: 0, current: '', phase: 'planning' });
    try {
      const groups = Object.entries(selectedGroups).filter(([, v]) => v).map(([k]) => k);
      const plan = await api.backupRestorePlan({ provider, params: params[provider] || {}, groups });
      if (plan && (plan.decision === 'conflict-local-newer' || plan.decision === 'conflict')) {
        setConflictPlan({ ...plan, groups });
        setConflictOpen(true);
        return; // 等待使用者在對話框中決定
      }
      await api.backupRestoreRun({ provider, params: params[provider] || {}, groups, force: false });
      setInfoDialog({ isOpen: true, title: t('sync.restore'), message: t('sync.restoreDone') });
    } catch (e) {
      console.error('restore failed:', e);
      setInfoDialog({ isOpen: true, title: t('sync.restore'), message: t('sync.restoreFailed') + (e && e.message ? e.message : String(e)) });
    } finally {
      setBusy(false);
      setTimeout(() => setProgress((p) => (p.done > 0 || p.total > 0) ? { ...p, phase: 'done' } : p), 50);
    }
  }

  const handleConflictProceed = async ({ includePaths } = {}) => {
    try {
      const groups = conflictPlan?.groups || Object.entries(selectedGroups).filter(([, v]) => v).map(([k]) => k);
      await api.backupRestoreRun({
        provider,
        params: params[provider] || {},
        groups,
        force: true,
        includePaths,
      });
      setConflictOpen(false);
      setConflictPlan(null);
      setInfoDialog({ isOpen: true, title: t('sync.restore'), message: t('sync.restoreDone') });
    } catch (e) {
      console.error('restore (force) failed:', e);
      setInfoDialog({ isOpen: true, title: t('sync.restore'), message: t('sync.restoreFailed') + (e && e.message ? e.message : String(e)) });
    }
  };

  function renderProviderParams() {
    if (provider === 's3') {
      const p = params.s3 || {};
      const setP = (k, v) => {
        setParams(prev => {
          const next = { ...(prev.s3 || {}), [k]: v };
          try { localStorage.setItem('backup.s3.params', JSON.stringify(next)); } catch (_) {}
          try { api && api.backupSetProviderParams && api.backupSetProviderParams('s3', next); } catch (_) {}
          return { ...prev, s3: next };
        });
      };
      return (
        <div className="card card-muted p-12">
          <div className="card-title">{t('sync.s3.title')}</div>
          <div className="form-row">
            <label className="form-label">Region</label>
            <input className="form-input" type="text" value={p.region || ''} onChange={(e) => setP('region', e.target.value)} placeholder="us-east-1" />
          </div>
          <div className="form-row">
            <label className="form-label">Bucket</label>
            <input className="form-input" type="text" value={p.bucket || ''} onChange={(e) => setP('bucket', e.target.value)} placeholder="your-bucket" />
          </div>
          <div className="form-row">
            <label className="form-label">Endpoint</label>
            <input className="form-input" type="text" value={p.endpoint || ''} onChange={(e) => setP('endpoint', e.target.value)} placeholder="https://s3.example.com" />
          </div>
          <div className="form-row">
            <label className="form-label">Access Key ID</label>
            <input className="form-input" type="text" value={p.accessKeyId || ''} onChange={(e) => setP('accessKeyId', e.target.value)} placeholder="your-access-key-id" />
          </div>
          <div className="form-row">
            <label className="form-label">Secret Access Key</label>
            <input className="form-input" type="password" value={p.secretAccessKey || ''} onChange={(e) => setP('secretAccessKey', e.target.value)} placeholder="your-secret-access-key" />
          </div>
          <div className="form-row">
            <label className="form-label">Prefix</label>
            <input className="form-input" type="text" value={p.prefix || ''} onChange={(e) => setP('prefix', e.target.value)} placeholder={t('sync.s3.prefix')} />
          </div>
          <div className="form-row">
            <ToggleSwitch checked={p.forcePathStyle ?? true} onChange={(v) => setP('forcePathStyle', !!v)} label="Force Path Style" />
          </div>
        </div>
      );
    }
    if (provider === 'dropbox') {
      const p = params.dropbox || {};
      const setP = (k, v) => {
        setParams(prev => {
          const next = { ...(prev.dropbox || {}), [k]: v };
          try { localStorage.setItem('backup.dropbox.params', JSON.stringify(next)); } catch (_) {}
          return { ...prev, dropbox: next };
        });
      };
      const handleConnect = async () => {
        if (!api) return;
        
        // 先關閉任何現有的 InfoDialog
        setInfoDialog({ isOpen: false, title: '', message: '' });
        
        // 先清理可能存在的 OAuth 服務器
        try {
          await api.dropboxOAuthStop();
        } catch (_) {}
        
        // 嘗試多個端口
        const tryPorts = [53789, 53790, 53791, 53792, 53793];
        let lastError = null;
        
        for (const port of tryPorts) {
          try {
            const res = await api.dropboxOAuthStart({ clientId: DROPBOX_APP_KEY, port });
            if (res && res.ok) {
              const auth = await api.dropboxGetAuth();
              setDropboxAuth(auth || { linked: true });
              try {
                const acct = await api.dropboxGetAccount();
                setDropboxAccount(acct || null);
                if (acct && acct.profile_photo_url) {
                  const dataUrl = await api.dropboxGetAccountPhoto(acct.profile_photo_url);
                  setDropboxAvatar(dataUrl || null);
                } else {
                  setDropboxAvatar(null);
                }
              } catch (_) { setDropboxAvatar(null); }
              setInfoDialog({ isOpen: true, title: 'Dropbox', message: t('sync.dropbox.linked') });
              return; // 成功，退出函數
            } else {
              // OAuth 返回失敗，嘗試下一個端口
              lastError = new Error('OAuth failed');
              continue;
            }
          } catch (e) {
            lastError = e;
            // 如果是端口被佔用錯誤，嘗試下一個端口
            if (e.message && e.message.includes('EADDRINUSE')) {
              continue;
            } else {
              // 其他錯誤，直接退出
              break;
            }
          }
        }
        
        // 所有端口都失敗了
        console.error('dropbox oauth error', lastError);
        // 發生錯誤時清理狀態
        try {
          await api.dropboxUnlink();
          await api.dropboxOAuthStop();
        } catch (_) {}
        setDropboxAuth({ linked: false });
        setDropboxAccount(null);
        setDropboxAvatar(null);
        setInfoDialog({ 
          isOpen: true, 
          title: 'Dropbox', 
          message: t('sync.dropbox.linkedFailedMessage') + (lastError && lastError.message ? lastError.message : String(lastError)) 
        });
      };
      const handleUnlink = async () => {
        if (!api) return;
        await api.dropboxUnlink();
        const auth = await api.dropboxGetAuth();
        setDropboxAuth(auth || { linked: false });
        setDropboxAccount(null);
        setDropboxAvatar(null);
      };
      // 邊界圓角容器 + 使用者卡片
      return (
        <div className="card card-muted p-12">
          <div className="card-title">{t('sync.dropbox.title')}</div>
          <div style={{ border: '1px solid var(--overlay-on-light-16)', borderRadius: 8, padding: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Avatar */}
              {dropboxAvatar ? (
                <img src={dropboxAvatar} alt="avatar" style={{ width: 48, height: 48, borderRadius: 24, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--overlay-on-light-12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  {dropboxAccount && dropboxAccount.name && dropboxAccount.name.display_name ? dropboxAccount.name.display_name.slice(0,1).toUpperCase() : 'D'}
                </div>
              )}
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dropboxAccount && dropboxAccount.name ? (dropboxAccount.name.display_name || t('sync.dropbox.nameless')) : t('sync.dropbox.nameless')}
                </div>
                <div style={{ opacity: 0.8, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dropboxAccount && dropboxAccount.email ? dropboxAccount.email : (dropboxAuth?.linked ? '—' : t('sync.dropbox.notLinked'))}
                </div>
              </div>
              {/* Action */}
              {dropboxAuth?.linked ? (
                <button className="btn btn-secondary" onClick={handleUnlink}>{t('sync.dropbox.unlink')}</button>
              ) : (
                <button className="btn btn-primary" onClick={handleConnect}>{t('sync.dropbox.connect')}</button>
              )}
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">Prefix</label>
            <input className="form-input" type="text" value={p.prefix || ''} onChange={(e) => setP('prefix', e.target.value)} placeholder={t('sync.dropbox.prefix')} />
          </div>
        </div>
      );
    }
    if (provider === 'webdav') {
      const p = params.webdav || {};
      const setP = (k, v) => {
        setParams(prev => {
          const next = { ...(prev.webdav || {}), [k]: v };
          try { localStorage.setItem('backup.webdav.params', JSON.stringify(next)); } catch (_) {}
          try { api && api.backupSetProviderParams && api.backupSetProviderParams('webdav', next); } catch (_) {}
          return { ...prev, webdav: next };
        });
      };
      return (
        <div className="card card-muted p-12">
          <div className="card-title">WebDAV 設定</div>
          <div className="form-row">
            <label className="form-label">Base URL</label>
            <input className="form-input" type="text" value={p.baseUrl || ''} onChange={(e) => setP('baseUrl', e.target.value)} placeholder="https://dav.example.com/remote.php/dav/files/username" />
          </div>
          <div className="form-row">
            <label className="form-label">Prefix</label>
            <input className="form-input" type="text" value={p.prefix || ''} onChange={(e) => setP('prefix', e.target.value)} placeholder={t('sync.webdav.prefix')} />
          </div>
          <div className="form-row">
            <label className="form-label">Username</label>
            <input className="form-input" type="text" value={p.username || ''} onChange={(e) => setP('username', e.target.value)} placeholder={t('sync.webdav.username')} />
          </div>
          <div className="form-row">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={p.password || ''} onChange={(e) => setP('password', e.target.value)} placeholder={t('sync.webdav.password')} />
          </div>
          <div className="form-row">
            <label className="form-label">Bearer Token</label>
            <input className="form-input" type="password" value={p.bearerToken || ''} onChange={(e) => setP('bearerToken', e.target.value)} placeholder={t('sync.webdav.bearerToken')} />
          </div>
          <div className="form-row" style={{ opacity: 0.8, fontSize: 12 }}>
            {t('sync.webdav.note')}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
    <ModalWithFooter
      isOpen={isOpen}
      onClose={onClose}
      title={<span>{t('sync.title')}</span>}
      size="md"
      initialFocusRef={nameRef}
      footer={footer}
    >
      {/* 選擇備份服務 */}
      <div className="card card-muted p-12 mb-12">
        <div className="form-row">
          <label className="form-label">{t('sync.service')}</label>
          <Select
            options={PROVIDERS}
            value={provider}
            onChange={(v) => setProvider(v)}
          />
        </div>
      </div>

      {/* 服務參數（依 provider 動態出現欄位，先佔位框架） */}
      <div className="mb-12">
        {renderProviderParams()}
      </div>

      {/* 內容選擇（開關） */}
      <div className="card card-muted p-12">
        <div className="card-title">{t('sync.content')}</div>
        {spec.groups.map(g => (
          <div key={g.key} className="mb-8">
            <ToggleSwitch
              checked={!!selectedGroups[g.key]}
              onChange={handleToggleGroup(g.key)}
              label={`${g.label}`}
            />
          </div>
        ))}
      </div>

      {/* 進度條容器（預設顯示，初始為待命狀態） */}
      <div className="card card-muted p-12  mb-12">
          <div className="card-title">{t('sync.progress')}</div>
          {/* 外框 */}
          <div style={{ position: 'relative', height: 8, borderRadius: 6, background: 'var(--overlay-on-light-12)', overflow: 'hidden' }}>
            {(() => {
              const pct = (() => {
                const t = Number(progress.total || 0);
                const d = Number(progress.done || 0);
                if (!t) return 0;
                const v = Math.max(0, Math.min(1, d / t));
                return Math.round(v * 100);
              })();
              return (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${Math.max(2, pct)}%`, // 最少顯示細條
                    background: 'linear-gradient(90deg, rgba(87,161,255,0.9), rgba(87,161,255,0.6))',
                    transform: 'translateZ(0)', // GPU-friendly
                    transition: 'width 200ms ease-out',
                  }}
                />
              );
            })()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, opacity: 0.9 }}>
            <div>
              {t('sync.status')}{t(`sync.phase.${progress.phase || 'idle'}`)}
            </div>
            <div>
              {t('sync.count', { done: Number(progress.done || 0), total: Number(progress.total || 0) })}
            </div>
          </div>
          {progress.current ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t('sync.current')}{progress.current}
            </div>
          ) : null}
        </div>
    </ModalWithFooter>

    {/* 衝突處理對話框 */}
    <ConflictResolveDialog
      isOpen={conflictOpen}
      plan={conflictPlan}
      groups={conflictPlan?.groups || []}
      onProceed={async (opts) => { await handleConflictProceed(opts); }}
      onClose={() => { setConflictOpen(false); setConflictPlan(null); }}
    />
    {/* 單按鈕資訊對話框（取代內建 alert） */}
    <ModalHeaderOnly
      isOpen={infoDialog.isOpen}
      onClose={() => setInfoDialog({ ...infoDialog, isOpen: false })}
      title={infoDialog.title}
      size="sm"
    >
      <div>{infoDialog.message}</div>
    </ModalHeaderOnly>
    </>
  );
}
