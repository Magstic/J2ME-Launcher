# YAML 配置說明（config.yml）

本文檔說明應用的 YAML 配置（單一權威來源，SSoT）。主要覆蓋兩個部分：

- emulators（模擬器全域設定與預設值）
- ui.clusterTagOptions（簇標籤的可選值）

---

## 配置檔路徑

- 位置：`%AppData%/J2ME-Launcher/config.yml`（Windows）
- 實際由 `app.getPath('userData')` 決定，函式：`src/main/config/yaml-config.js#getConfigPath()`

---

## 結構總覽

```yaml
version: 1
runtime:
  javaPath: null
emulators:
  freej2mePlus:
    jarPath: ''
    romCache: true
    defaults:
      fullscreen: 0
      width: 240
      height: 320
      scale: 2
      keyLayout: 0
      framerate: 60
      backlightcolor: 'Disabled'
      fontoffset: 0
      rotate: 0
      fpshack: 'Disabled' # 'Disabled' | 'Safe' | 'Extended' | 'Aggressive'
      sound: 'on'
      spdhacknoalpha: 'off'
      compatfantasyzonefix: 'off'
      compatimmediaterepaints: 'off'
      compatoverrideplatchecks: 'on'
      compatsiemensfriendlydrawing: 'off'
      compattranstooriginonreset: 'off'
      textfont: 'Default'
      soundfont: 'Default'
  ke:
    jarPath: ''
    romCache: true
  libretro:
    retroarchPath: ''
    corePath: ''
    romCache: false
  squirreljme:
    jarPath: ''
    romCache: true
ui:
  defaultView: 'desktop'
  showUncategorized: true
  folderLayout: 'grid'
  clusterTagOptions:
    devices: ['Nokia N95', 'SonyEricsson K750']
    resolutions: ['176x220', '240x320', '360x640']
    versions: ['MIDP-1.0', 'MIDP-2.0']
```

-## runtime 區塊

- 來源檔：
  - `src/main/services/config-service.js`（`get/set('javaPath')`、`resolveJavaPath()`、`isValidJavaPath()`）
  - `src/main/ipc/config.js`（`get-java-path` / `set-java-path` / `validate-java-path` / `browse-java-executable`）
- 結構：
  - `runtime.javaPath: string | null`
- 行為：
  - 若 `javaPath` 為 `null` 或未設定，將自動解析：自訂路徑 → `JAVA_HOME/JDK_HOME` → 系統 `java`（`PATH`）。
  - 設定時會檢查存在性與可執行權限（非 Windows 亦檢查 `+x`）。
  - UI 可透過 `browse-java-executable` 讓使用者挑選 Java 可執行檔，並用 `validate-java-path` 驗證。

## emulators 區塊

- 來源檔：`src/main/config/yaml-config.js`（`DEFAULTS` 與 `validate()`）
- UI 入口：`src/components/EmulatorConfigDialog.jsx`

### freej2mePlus

- `jarPath`：FreeJ2ME-Plus 可執行 JAR 的路徑
- `romCache`：是否使用 ROM 快取（boolean）
- `defaults`：寫入遊戲啟動配置的基線預設（數值會在後端被範圍修正）
  - `width`：64–1080
  - `height`：64–1920
  - `scale`：1–5
  - `framerate`：30–240
  - 其餘為枚舉/字串，依 FreeJ2ME-Plus 支援值為準（UI 會做選項限制）

### ke（KEmulator）

- `jarPath`、`romCache`

### libretro

- `retroarchPath`、`corePath`、`romCache`

### squirreljme

- `jarPath`、`romCache`
- 啟動命令（參考程式）：`java -jar <squirreljme-standalone.jar> -jar <game.jar>`（`src/main/emulators/squirreljme.js#buildCommand()`）
- 目前不提供自訂啟動參數（per-game params 不適用）

### 寫入與自我修復

- 每次讀取會經 `validate()` 進行自我修復與補全缺失鍵，並在必要時回寫更正後的配置。
- 寫入採用原子寫入（先 `.tmp` 後 `rename`）。
- 每次覆寫會產生一份簡單備份：`config.yml.bak`。
- 解析失敗會把原檔備份為 `config.yml.corrupt.<timestamp>`，再以預設/修正後內容重建。

---

## ui.clusterTagOptions 區塊

- IPC：
  - 讀取：`get-cluster-tag-options` → `window.electronAPI.getClusterTagOptions()`
  - 寫入：`set-cluster-tag-options` → `window.electronAPI.setClusterTagOptions(options)`
- 位置：`src/main/ipc/config.js`
- 結構：
  - `devices: string[]`
  - `resolutions: string[]`
  - `versions: string[]`
- 清洗規則：後端會過濾掉非字串或空白字串；其餘值原樣保存。
- UI 行為：前端渲染時會與內建預設做「append-only 合併」，因此 YAML 僅需填「增量擴充項」。

### 範例

```yaml
ui:
  clusterTagOptions:
    devices: ['Nokia N73', 'Motorola E398']
    resolutions: ['128x160', '176x208']
    versions: ['CLDC-1.1']
```

---

## 優先級與遷移策略

- 權威來源（SSoT）：YAML `config.yml`。
- 舊版 JSON 兼容：若首次讀取時檢測到舊的 `clusterTagOptions`（存於舊設定服務），會自動遷移並寫入 YAML，之後以 YAML 為準。
- UI 合併：對於 `ui.clusterTagOptions`，前端會用 YAML 的值「追加」到內建預設，用於下拉選單；不會覆蓋/刪除內建值。

---

## 常見問題

- 如何恢復預設？
  - 關閉應用後，手動刪除 `config.yml`；下次啟動會以預設重新生成。
- 可以手動編輯嗎？
  - 可以。請保持資料型別正確（數值/布林/字串），枚舉值建議使用 UI 中已存在的選項。保存後應用會自動修復缺失鍵與不合理數值。
- 版本欄位有何用途？
  - 目前為 `1`，預留未來升級/遷移使用。

---

## 相關代碼

- `src/main/config/yaml-config.js`（讀/寫、校驗、自我修復、備份）
- `src/main/ipc/config.js`（Cluster Tag Options 的 IPC）
- `src/components/EmulatorConfigDialog.jsx`（模擬器 UI 與保存流程）

---

## 合併與優先順序（重要）

- **讀取流程（自我修復）**
  - 實作：`src/main/config/yaml-config.js#loadOrInit()`、`validate()`、`deepMerge()`
  - 合併順序：`DEFAULTS` → `磁碟 YAML` → `validate()` 範圍修正與補全
  - 若發現型別/範圍異常，會以預設值修正並回寫（保持使用者變更，其它鍵補齊）。
  - 陣列合併語義：`deepMerge()` 對物件做遞迴合併，但對陣列採「整體替換」，不做元素級合併。

- **寫入流程（合併保存）**
  - 實作：`saveConfig(partial)` → 先 `loadOrInit()`，再 `deepMerge(current, partial)`，最後 `validate()` 與原子寫入。
  - 意味著可只提供局部 `partial`（例如只更新 `freej2mePlus.defaults`），其餘設定保持不變。

- **運行時參數決議（FreeJ2ME-Plus）**
  - 實作：`src/main/services/emulator-service.js`
  - 來源優先順序：
    1. 若該遊戲 `perGame.freej2mePlus.useGlobal === false`，則使用 `perGame.freej2mePlus.params`
    2. 否則使用全域 `emulators.freej2mePlus.defaults`
  - 額外規則：`textfont`、`soundfont` 寫入 `game.conf` 時一律取用「全域」預設值（即使每遊戲提供了值）。
  - 範圍修正：`width[64..1080]`、`height[64..1920]`、`scale[1..5]`、`framerate[30..240]`（`validate()` 層負責）。
  - 補齊缺鍵：運行時會套用一組 `extendedDefaults` 以確保 `game.conf` 完整（例如 `compat*`、`backlightcolor` 等）。這個補齊僅用於啟動流程，不會回寫 YAML。

- **romCache 預設值與覆寫**
  - FreeJ2ME-Plus：預設開啟（可 per-game 覆寫）
  - KEmulator（`ke`）：預設開啟（可 per-game 覆寫）
  - Libretro：預設關閉（可 per-game 覆寫）
  - SquirrelJME：預設開啟（可 per-game 覆寫）

- **選用模擬器**
  - 每遊戲可存 `emulator` 或 `selectedEmulator`（`ke`、`freej2mePlus`、`squirreljme`、`libretro`），未指定時預設為 `freej2mePlus`。額外相容：舊值 `kemulator` 會在運行時映射為 `ke`。

---

## 每遊戲覆寫與同步

- **儲存位置**
  - 每遊戲的模擬器設定存於 SQLite（`src/main/sql/emulator-configs`），非 YAML。
  - 取用：`DataStore.getGameEmulatorConfig(filePath)`。

- **覆寫粒度**
  - FreeJ2ME-Plus：支援 `useGlobal` 與 `params`，可完整覆寫全域預設。
  - KEmulator、Libretro：目前主要覆寫 `romCache` 與模擬器選擇。

- **變更影響**
  - 對於 `useGlobal === false` 的遊戲，後續修改全域 YAML 不會影響該遊戲。
  - 對於未覆寫的遊戲，會即時繼承全域 YAML 的更新（下次啟動生效）。

---

## Libretro 參數與支援狀態

- **欄位**（YAML：`emulators.libretro`）
  - `retroarchPath`：RetroArch 可執行檔路徑（Windows 範例：`C:\\RetroArch\\retroarch.exe`）
  - `corePath`：Libretro 核心（DLL）路徑（例如 `freej2me_libretro.dll`）
  - `romCache`：是否啟用 JAR 快取（預設關閉）

- **啟動命令**
  - `retroarch.exe -L <core.dll> <content>`（參考：`src/main/emulators/libretro.js#buildCommand()`）
  - 目前以 RetroArch 所在資料夾為 `cwd`，確保其相對路徑設定可用。

- **內容準備（可選）**
  - 若 `romCache=true` 則會透過 MD5 快取生成中繼 JAR（`ensureCachedJar`）。

- **相容性**
  - 目前以 Windows 為主要目標（核心副檔名 `.dll`）；其他平台請依實務測試調整。

---

## 備份、原子寫入與恢復策略

- **檔案位置**：`app.getPath('userData')/config.yml`
- **原子寫入**：先寫入 `config.yml.tmp`，再 `rename` 取代正式檔（避免中斷造成的半寫入狀態）。
- **備份**：寫入前會以 `config.yml.bak` 保留上一版。
- **損壞恢復**：讀取 YAML 失敗時，會將原檔另存為 `config.yml.corrupt.<timestamp>`，然後以預設/修正後內容重建。

---

## 雲端備份與還原（BackupDialog）

- 相關檔案：
  - `src/main/ipc/backup.js`（IPC 端點）
  - `src/main/backup/core.js`（備份/還原核心流程）
  - `src/shared/backup/spec.js`（備份分組與相對路徑定義）
  - `src/components/ui/dialogs/BackupDialog.jsx`（前端 UI）

- 分組（`BACKUP_SPEC.groups`）：
  - `config`：`j2me-launcher/config.yml`
  - `database`：`j2me-launcher/data.db`（備份時會先生成一致性快照 `data.backup.db`）
  - `rms`：依模擬器配置動態解析，例如：
    - FreeJ2ME-Plus：`<FJ-jar-dir>/rms` → `external/freej2mePlus/rms/*`
    - KEmulator：`<KE-jar-dir>/rms` → `external/kemulator/rms/*`
    - Libretro：`<RetroArch>/saves/FreeJ2ME-Plus/freej2me/rms` → `external/libretro/freej2me/rms/*`
    - SquirrelJME：
      - Windows：`%LOCALAPPDATA%/squirreljme/data` → `external/squirreljme/*`
      - Linux：`$XDG_STATE_HOME/squirreljme` 或 `~/.local/state/squirreljme` → `external/squirreljme/*`
  - `emuConfig`：依模擬器配置動態解析，例如：
    - FreeJ2ME-Plus：`<FJ-jar-dir>/config` → `external/freej2mePlus/config/*`
    - Libretro：`<RetroArch>/saves/FreeJ2ME-Plus/freej2me/config` → `external/libretro/freej2me/config/*`

- 提供者（Providers）：S3、Dropbox、WebDAV（參見 `providers/*.js`）。

- 模式與規劃：
  - `backup:run` 支援 `mode: 'full' | 'incremental'`
  - `backup:restore-plan` 會比對本地/遠端索引，返回 `decision`：`ok` | `conflict` | `conflict-local-newer` 與詳細差異。
  - 對 `config.yml` 採「語義 MD5」：會先解析 YAML → 穩定 JSON 字串化再計算 MD5，忽略純格式化差異。
  - 恢復支援 `includePaths` 過濾與 `force` 覆蓋。
  - 路徑解析：針對 `BACKUP_SPEC` 中的相對路徑，同時嘗試 `userData/…` 與其上層 `Roaming/…`，若兩地皆存在則取較新者。
  - 遠端索引：會在遠端寫入 `index.tsv` 與 `index.meta.json` 用於比對與摘要。
  - 資料庫恢復：使用 `data.backup.db` 覆蓋本地 `data.db`，並移除 `data.db-wal`、`data.db-shm`；恢復後會觸發一次全量重掃（重建衍生資料，例如圖標）。

- 可選 YAML 設定（未列於預設 `DEFAULTS`，如需可自行新增）：
  - `backup.ignoreConfigYml: boolean`（預設為 false）：若為 true，還原規劃時忽略 `j2me-launcher/config.yml` 的差異。
  - `backup.ignorePatterns: string[]`：忽略路徑前綴或簡易萬用字元（`*`）規則，例如：
    ```yaml
    backup:
      ignorePatterns:
        - 'external/freej2mePlus/rms/'
        - 'external/libretro/freej2me/config/*'
    ```

- 認證與參數：
  - Dropbox：採用 PKCE 流程並保存 `accessToken/refreshToken/clientId`（`j2me-launcher/auth/dropbox.json`）。
  - S3/WebDAV：可在 UI 儲存常用參數，主進程讀取本機加載（`backup:get/set-provider-params`）。

---

## 疑難排解與日誌

- **無法啟動（未配置）**
  - 錯誤：`EMULATOR_NOT_CONFIGURED`。請檢查 `freej2mePlus.jarPath`、`ke.jarPath`、`libretro.retroarchPath/corePath` 是否為有效檔案。

- **路徑/參數問題**
  - Windows：路徑中含空白時會自動正確引用（由 `buildCommandLine` 統一處理）。
  - Libretro/RetroArch：請確認 `corePath` 與內容格式相容。

- **YAML 讀取錯誤**
  - 主進程日誌會輸出 `[YAML]` 前綴訊息；若配置被自動修復或轉存，請檢查 `config.yml.bak` 與 `config.yml.corrupt.*`。

---

## 完整 YAML 範例（可直接貼上）

```yaml
version: 1
emulators:
  freej2mePlus:
    jarPath: "C:\\Emus\\FreeJ2ME-Plus\\FreeJ2ME-Plus.jar"
    romCache: true
    defaults:
      fullscreen: 0
      width: 240
      height: 320
      scale: 2
      keyLayout: 0
      framerate: 60
      backlightcolor: 'Disabled'
      fontoffset: 0
      rotate: 0
      fpshack: 'Disabled' # Disabled | Safe | Extended | Aggressive
      sound: 'on'
      spdhacknoalpha: 'off'
      compatfantasyzonefix: 'off'
      compatimmediaterepaints: 'off'
      compatoverrideplatchecks: 'on'
      compatsiemensfriendlydrawing: 'off'
      compattranstooriginonreset: 'off'
      textfont: 'Default'
      soundfont: 'Default'
  ke:
    jarPath: "C:\\Emus\\KEmulator\\KEmulator.jar"
    romCache: true
  squirreljme:
    jarPath: "C:\\Emus\\SquirrelJME\\squirreljme-standalone.jar"
    romCache: true
  libretro:
    retroarchPath: "C:\\RetroArch\\retroarch.exe"
    corePath: "C:\\RetroArch\\cores\\freej2me_libretro.dll"
    romCache: false
ui:
  defaultView: 'desktop'
  showUncategorized: true
  folderLayout: 'grid'
  clusterTagOptions:
    devices: ['Nokia N95', 'SonyEricsson K750']
    resolutions: ['176x220', '240x320', '360x640']
    versions: ['MIDP-1.0', 'MIDP-2.0']
```
