import React from 'react';
import { ModalWithFooter, Select } from '@ui';
import useContextMenu from '@components/Common/useContextMenu.jsx';
import { useTranslation } from '@hooks/useTranslation';
import './ClusterDialog.css';
import DEFAULT_CLUSTER_TAG_OPTIONS from '@config/clusterTags';
import useCreateShortcut from '@shared/hooks/useCreateShortcut';

// 簇詳情對話框（列表樣式，固定尺寸）
// - 列表欄位：圖標、遊戲名、廠商、機型、解析度、版本 + 操作
// - 標籤選項：優先讀 Settings 設定，否則退回 DEFAULT_CLUSTER_TAG_OPTIONS（單一來源）

// 單行成員列（高度自適應），以 filePath 為 key；
// 使用 React.memo 避免非必要重渲染：除非該行的 tags/name/vendor/icon 或 isPrimary 改變
const ClusterMemberRow = React.memo(
  function ClusterMemberRow({
    m,
    isPrimary,
    tagOptions,
    onUpdateTag,
    openContextMenu,
    selectSize = 'sm',
  }) {
    const rowGrid = '56px 3fr 2fr 1.6fr 1.4fr 1.4fr';
    const opt = React.useMemo(() => {
      const uniq = (arr) =>
        Array.from(new Set((arr || []).filter((x) => typeof x === 'string' && x.trim())));
      const mergedDevices = uniq([
        ...(DEFAULT_CLUSTER_TAG_OPTIONS.devices || []),
        ...(tagOptions.devices || []),
      ]);
      const mergedRes = uniq([
        ...(DEFAULT_CLUSTER_TAG_OPTIONS.resolutions || []),
        ...(tagOptions.resolutions || []),
      ]);
      const mergedVer = uniq([
        ...(DEFAULT_CLUSTER_TAG_OPTIONS.versions || []),
        ...(tagOptions.versions || []),
      ]);
      return {
        devices: mergedDevices.map((v) => ({ value: v, label: v })),
        resolutions: mergedRes.map((v) => ({ value: v, label: v })),
        versions: mergedVer.map((v) => ({ value: v, label: v })),
      };
    }, [tagOptions]);
    const tags = m.tags || {};
    return (
      <div
        key={m.filePath}
        onContextMenu={(e) => openContextMenu(e, { ...m, isPrimary }, 'cluster-member')}
        className={`cluster-member-row${isPrimary ? ' is-primary' : ''}`}
        style={{
          background: 'var(--background-secondary)',
          borderRadius: 10,
          padding: '8px 10px',
          margin: '8px 4px',
          display: 'grid',
          gridTemplateColumns: rowGrid,
          alignItems: 'center',
          gap: 12,
          cursor: 'default',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--overlay-on-light-08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={m.iconUrl || '/icon.ico'}
            alt="icon"
            style={{ width: 44, height: 44, objectFit: 'cover' }}
            draggable={false}
          />
        </div>
        <div
          title={m.gameName}
          style={{
            fontWeight: 600,
            paddingRight: 8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {m.gameName}
        </div>
        <div
          title={m.vendor}
          style={{
            opacity: 0.85,
            paddingRight: 8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {m.vendor || '-'}
        </div>
        <div>
          <Select
            size={selectSize}
            options={[{ value: '', label: '——' }, ...opt.devices]}
            value={tags.device || ''}
            onChange={(val) => onUpdateTag(m.filePath, 'device', val || '')}
          />
        </div>
        <div>
          <Select
            size={selectSize}
            options={[{ value: '', label: '——' }, ...opt.resolutions]}
            value={tags.resolution || ''}
            onChange={(val) => onUpdateTag(m.filePath, 'resolution', val || '')}
          />
        </div>
        <div>
          <Select
            size={selectSize}
            options={[{ value: '', label: '——' }, ...opt.versions]}
            value={tags.version || ''}
            onChange={(val) => onUpdateTag(m.filePath, 'version', val || '')}
          />
        </div>
      </div>
    );
  },
  (prev, next) => {
    try {
      if (prev.m.filePath !== next.m.filePath) return false;
      if (!!prev.isPrimary !== !!next.isPrimary) return false;
      const a = prev.m,
        b = next.m;
      if ((a.gameName || '') !== (b.gameName || '')) return false;
      if ((a.vendor || '') !== (b.vendor || '')) return false;
      if ((a.iconUrl || '') !== (b.iconUrl || '')) return false;
      const t1 = JSON.stringify(a.tags || null);
      const t2 = JSON.stringify(b.tags || null);
      if (t1 !== t2) return false;
      // 粗略比較選項長度，若選項變更（通常很少），允許重渲染
      const lenEq =
        (prev.tagOptions.devices?.length || 0) === (next.tagOptions.devices?.length || 0) &&
        (prev.tagOptions.resolutions?.length || 0) === (next.tagOptions.resolutions?.length || 0) &&
        (prev.tagOptions.versions?.length || 0) === (next.tagOptions.versions?.length || 0);
      if (!lenEq) return false;
      return true;
    } catch (_) {
      return false;
    }
  }
);

export default function ClusterDialog({ isOpen, clusterId, onClose }) {
  const [cluster, setCluster] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  // Append-only extras from YAML; UI will union with defaults when rendering
  const [tagOptions, setTagOptions] = React.useState({
    devices: [],
    resolutions: [],
    versions: [],
  });
  // 用於抑制「本地剛剛更新」引發的閃爍（在極短時間內到達的 cluster:changed 事件）
  const lastLocalMemberUpdateAtRef = React.useRef(0);
  // 更多本地操作的時間窗：設為代表、移除成員
  const lastLocalPrimaryUpdateAtRef = React.useRef(0);
  const lastLocalRemovalUpdateAtRef = React.useRef(0);
  const { t } = useTranslation();
  // 共享的捷徑建立邏輯（對單一或多選成員均適用）
  const emptySelected = React.useMemo(() => [], []);
  const noopSetSelected = React.useCallback(() => {}, []);
  const createShortcut = useCreateShortcut(
    members,
    emptySelected,
    noopSetSelected,
    'ClusterDialog'
  );

  // 右鍵選單（行內操作移至此處），層級需高於彈窗（dialog.css: .modal-overlay z-index=10000）
  const { ContextMenuElement, openContextMenu } = useContextMenu({
    onGameLaunch: (m) => handleLaunch(m.filePath),
    onCreateShortcut: createShortcut,
    onGameConfigure: (m) => handleConfig(m.filePath),
    onGameInfo: (m) => handleInfo(m.filePath),
    onClusterMemberSetPrimary: (m) => handleSetPrimary(m.filePath),
    onClusterMemberRemove: (m) => handleRemoveMember(m.filePath),
    zIndex: 11000,
  });

  const loadData = React.useCallback(
    async (opts = {}) => {
      if (!isOpen || !clusterId) return;
      const silent = !!opts.silent;
      if (!silent) setLoading(true);
      try {
        const { cluster } = await window.electronAPI.getCluster(clusterId);
        const { members } = await window.electronAPI.getClusterMembers(clusterId);
        setCluster(cluster || null);
        const next = Array.isArray(members) ? members : [];
        setMembers((prev) => {
          try {
            if (Array.isArray(prev) && prev.length === next.length) {
              // 輕量級等價判斷：以 filePath 與 tags JSON 作為比較鍵
              const mapA = new Map(
                prev.map((x) => [String(x.filePath || ''), JSON.stringify(x.tags || null)])
              );
              let same = true;
              for (const m of next) {
                const k = String(m.filePath || '');
                const v = JSON.stringify(m.tags || null);
                if (!mapA.has(k) || mapA.get(k) !== v) {
                  same = false;
                  break;
                }
              }
              if (same) return prev; // 不變更狀態，避免不必要的重渲染
            }
          } catch (_) {}
          return next;
        });
      } catch (e) {
        console.error('載入簇資料失敗:', e);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isOpen, clusterId]
  );

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // 載入標籤選項：讀取 YAML extras；UI 端與內建合併（append-only 模式）
  React.useEffect(() => {
    let mounted = true;
    if (!isOpen) return;
    (async () => {
      try {
        const opts = await window.electronAPI.getClusterTagOptions();
        if (!mounted) return;
        const sanitize = (arr) =>
          Array.isArray(arr) ? arr.filter((v) => typeof v === 'string' && v.trim().length > 0) : [];
        const extras =
          opts && typeof opts === 'object'
            ? {
                devices: sanitize(opts.devices),
                resolutions: sanitize(opts.resolutions),
                versions: sanitize(opts.versions),
              }
            : { devices: [], resolutions: [], versions: [] };
        setTagOptions(extras);
      } catch (_) {
        if (mounted) setTagOptions({ devices: [], resolutions: [], versions: [] });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // 簇變更事件：本簇有更新時即時重載；
  // 若是「剛剛在本地更新的成員標籤」觸發的事件，直接忽略此次重載（已做樂觀更新，避免任何閃爍）
  React.useEffect(() => {
    const reconcileMembersSilent = async () => {
      try {
        const { members: nextMembers } = await window.electronAPI.getClusterMembers(clusterId);
        const next = Array.isArray(nextMembers) ? nextMembers : [];
        setMembers((prev) => {
          // 以 filePath 為 key 做合併：未變者保留原物件引用；變更者替換
          const byPath = new Map(prev.map((x) => [String(x.filePath || ''), x]));
          const merged = next.map((n) => {
            const k = String(n.filePath || '');
            const old = byPath.get(k);
            if (!old) return n; // 新增成員
            const sameTags = JSON.stringify(old.tags || null) === JSON.stringify(n.tags || null);
            const sameVendor = (old.vendor || '') === (n.vendor || '');
            const sameName = (old.gameName || '') === (n.gameName || '');
            const sameIcon = (old.iconUrl || '') === (n.iconUrl || '');
            if (sameTags && sameVendor && sameName && sameIcon) return old; // 引用不變，避免重渲染
            return { ...old, ...n };
          });
          return merged;
        });
      } catch (_) {
        /* 忽略 */
      }
    };
    const off = window.electronAPI.onClusterChanged?.((payload) => {
      try {
        if (payload && payload.id && payload.id === clusterId) {
          const now = Date.now();
          const deltaTags = now - (lastLocalMemberUpdateAtRef.current || 0);
          const deltaPrimary = now - (lastLocalPrimaryUpdateAtRef.current || 0);
          const deltaRemoval = now - (lastLocalRemovalUpdateAtRef.current || 0);
          // 1) 成員標籤剛更新：忽略一次事件
          if (payload.action === 'members-updated' && deltaTags >= 0 && deltaTags < 1200) {
            return;
          }
          // 2) 剛設為代表：忽略一次『非成員結構』更新，以免閃爍
          if (
            deltaPrimary >= 0 &&
            deltaPrimary < 1200 &&
            payload.action &&
            payload.action !== 'members-updated'
          ) {
            return;
          }
          // 3) 剛移除成員：若事件提示為結構變更（移除），忽略全量重載，交由本地狀態生效
          if (
            payload.action === 'members-updated' &&
            deltaRemoval >= 0 &&
            deltaRemoval < 1200 &&
            payload.removed &&
            payload.removed > 0
          ) {
            return;
          }
          // 非本地觸發或超過時間窗：
          if (payload.action === 'members-updated') {
            const hasStructureChange =
              payload &&
              ((payload.added && payload.added > 0) || (payload.removed && payload.removed > 0));
            // 若剛設為代表且沒有結構變更，忽略此次事件，避免任何形式的重載造成閃爍
            if (deltaPrimary >= 0 && deltaPrimary < 1200 && !hasStructureChange) {
              return;
            }
            if (hasStructureChange) {
              // 新增/移除：長度變化，靜默全量重載
              loadData({ silent: true });
            } else if (payload.filePath) {
              // 純標籤變更（或成員局部變化）：只補丁該成員，避免整列表重渲染
              const k = String(payload.filePath || '');
              const nextTags = payload.tags == null ? null : payload.tags;
              setMembers((prev) =>
                prev.map((x) => (String(x.filePath || '') === k ? { ...x, tags: nextTags } : x))
              );
            } else {
              // 後備：無明確 filePath 的 members-updated，做輕量合併
              reconcileMembersSilent();
            }
          } else {
            // 非 members-updated 的一般屬性更新：採用靜默重載，避免短暫 LOADING 閃爍
            loadData({ silent: true });
          }
        }
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, [clusterId, loadData]);

  // 監聽遊戲增量更新：若有成員的名稱/廠商/圖標變更，即時修補該行，避免依賴整簇重載
  React.useEffect(() => {
    const off = window.electronAPI?.onGamesIncrementalUpdate?.((update) => {
      try {
        // 兼容多種回傳結構
        const arr = Array.isArray(update?.games)
          ? update.games
          : Array.isArray(update)
            ? update
            : update
              ? [update]
              : [];
        if (!arr || arr.length === 0) return;
        const norm = (u) => ({
          filePath: u?.filePath || u?.path || u?.fp || '',
          gameName: u?.gameName || u?.title || u?.name || u?.customName,
          vendor: u?.vendor || u?.customVendor,
          iconUrl: u?.iconUrl || u?.icon,
        });
        const updates = arr.map(norm).filter((u) => u.filePath);
        if (updates.length === 0) return;
        setMembers((prev) => {
          let changed = false;
          const byPath = new Map(updates.map((u) => [String(u.filePath), u]));
          const next = prev.map((m) => {
            const u = byPath.get(String(m.filePath));
            if (!u) return m;
            const n = {
              ...m,
              gameName: u.gameName !== undefined ? u.gameName || m.gameName : m.gameName,
              vendor: u.vendor !== undefined ? u.vendor || m.vendor : m.vendor,
              iconUrl: u.iconUrl !== undefined ? u.iconUrl || m.iconUrl : m.iconUrl,
            };
            changed = changed || n !== m;
            return n;
          });
          return changed ? next : prev;
        });
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  // 後備：監聽全量遊戲更新，補丁當前簇成員的名稱/廠商/圖標
  React.useEffect(() => {
    const off = window.electronAPI?.onGamesUpdated?.((games) => {
      try {
        const arr = Array.isArray(games) ? games : [];
        if (arr.length === 0) return;
        const byPath = new Map(arr.map((g) => [String(g.filePath || g.path || ''), g]));
        setMembers((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            const g = byPath.get(String(m.filePath));
            if (!g) return m;
            const n = {
              ...m,
              gameName: g.gameName || g.name || m.gameName,
              vendor: g.vendor || m.vendor,
              iconUrl: g.iconUrl || m.iconUrl,
            };
            changed = changed || n !== m;
            return n;
          });
          return changed ? next : prev;
        });
      } catch (_) {}
    });
    return () => {
      try {
        off && off();
      } catch (_) {}
    };
  }, []);

  const handleSetPrimary = async (filePath) => {
    if (!cluster) return;
    try {
      const res = await window.electronAPI.setClusterPrimary(cluster.id, filePath);
      if (!res?.success) {
        console.warn('設為代表失敗:', res?.error || res);
        // 退回靜默刷新，避免閃爍
        loadData({ silent: true });
        return;
      }
      // 樂觀更新：立即更新本地 primary 指向
      setCluster((prev) => (prev ? { ...prev, primaryFilePath: filePath } : prev));
      lastLocalPrimaryUpdateAtRef.current = Date.now();
    } catch (e) {
      console.error('設為代表失敗:', e);
    }
  };

  const handleUpdateTag = React.useCallback(
    async (filePath, key, value) => {
      try {
        const m = members.find((x) => x.filePath === filePath);
        const nextTags = { ...(m?.tags || {}) };
        if (value == null || value === '') delete nextTags[key];
        else nextTags[key] = value;
        const res = await window.electronAPI.updateClusterMemberTags(clusterId, filePath, nextTags);
        if (!res?.success) {
          console.warn('更新標籤失敗:', res?.error || res);
        }
        // 即時更新 UI（樂觀）
        setMembers((prev) =>
          prev.map((x) => (x.filePath === filePath ? { ...x, tags: nextTags } : x))
        );
        // 標記一次本地更新，以便隨後「members-updated」事件採用靜默重載避免閃爍
        lastLocalMemberUpdateAtRef.current = Date.now();
      } catch (e) {
        console.error('更新標籤失敗:', e);
      }
    },
    [clusterId, members]
  );

  const handleRemoveMember = async (filePath) => {
    try {
      const res = await window.electronAPI.removeGameFromCluster(clusterId, filePath);
      if (!res?.success) {
        console.warn('移除成員失敗:', res?.error || res);
        // 後備：靜默刷新
        loadData({ silent: true });
        return;
      }
      // 預先計算下一版列表，確保 primary 回退依據一致
      const nextMembers = members.filter((x) => x.filePath !== filePath);
      // 樂觀更新：先本地移除該行
      setMembers(nextMembers);
      // 若剛移除的是代表成員，嘗試切換到剩餘列表的第一個；若無，清空
      setCluster((prev) => {
        if (!prev) return prev;
        if ((prev.primaryFilePath || '').toLowerCase() !== (filePath || '').toLowerCase())
          return prev;
        const nextPrimary = nextMembers[0]?.filePath || '';
        return { ...prev, primaryFilePath: nextPrimary };
      });
      lastLocalRemovalUpdateAtRef.current = Date.now();
    } catch (e) {
      console.error('移除成員失敗:', e);
    }
  };

  const handleLaunch = async (filePath) => {
    try {
      await window.electronAPI.launchGame(filePath);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfig = (filePath) => {
    try {
      const m = members.find((x) => x.filePath === filePath);
      window.dispatchEvent(new CustomEvent('open-game-config', { detail: m }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleInfo = (filePath) => {
    try {
      const m = members.find((x) => x.filePath === filePath);
      window.dispatchEvent(new CustomEvent('open-game-info', { detail: m }));
    } catch (e) {
      console.error(e);
    }
  };

  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 14, opacity: 0.85 }}>
        {cluster
          ? `${cluster.name || t('cluster.untitled')} · ${members.length}`
          : t('app.loading')}
      </div>
    </div>
  );

  const footer = (
    <div className="flex gap-8 push-right">
      <button className="btn btn-secondary" onClick={onClose}>
        {t('app.close')}
      </button>
    </div>
  );

  return (
    <ModalWithFooter
      isOpen={!!isOpen}
      onClose={onClose}
      title={Header}
      size="lg"
      footer={footer}
      className="cluster-dialog"
      bodyClassName="cluster-dialog-body"
      preserveScrollOnMutations={false}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, height: '100%' }}
      >
        {/* 列表（無表頭，統一對齊比例） */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', paddingRight: 4 }}>
          {loading ? (
            <div style={{ padding: 16, opacity: 0.7 }}>{t('app.loading')}</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 16, opacity: 0.7 }}>{t('cluster.empty')}</div>
          ) : (
            members.map((m) => {
              const isPrimary =
                cluster &&
                cluster.primaryFilePath &&
                cluster.primaryFilePath.toLowerCase() === (m.filePath || '').toLowerCase();
              return (
                <ClusterMemberRow
                  key={m.filePath}
                  m={m}
                  isPrimary={!!isPrimary}
                  tagOptions={tagOptions}
                  onUpdateTag={handleUpdateTag}
                  openContextMenu={openContextMenu}
                  selectSize="sm"
                />
              );
            })
          )}
        </div>
        {ContextMenuElement}
      </div>
    </ModalWithFooter>
  );
}
