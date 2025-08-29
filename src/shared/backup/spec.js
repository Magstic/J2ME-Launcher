// src/shared/backup/spec.js
// 單檔模組化：定義需要備份的相對路徑與分組
// 注意：這裡僅存放相對於 app.getPath('userData') 的相對路徑，
// 由主進程負責解析為絕對路徑與實際備份行為。

/**
 * 需要備份的項目定義（相對於 userData）
 */
const BACKUP_SPEC = Object.freeze({
  groups: [
    {
      key: 'config',
      label: 'config.yml',
      items: ['j2me-launcher/config.yml']
    },
    {
      key: 'database',
      label: 'data.db',
      items: ['j2me-launcher/data.db']
    },
    {
      key: 'rms',
      label: 'RMS',
      items: [] // 由主進程根據 config.yml 動態解析
    },
    {
      key: 'emuConfig',
      label: 'Emulator Config',
      items: [] // 由主進程根據 config.yml 動態解析
    }
  ]
});

module.exports = {
  BACKUP_SPEC
};
