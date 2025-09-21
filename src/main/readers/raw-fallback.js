// 原始文件讀取與手動ZIP解析備援（繁中註釋）
const fs = require('fs-extra');
const path = require('path');
const yauzl = require('yauzl');

// 備用函數2：嘗試原始文件讀取和手動ZIP解析
async function tryRawFileAnalysis(jarPath) {
  const fileName = path.basename(jarPath);
  console.log(`🔍 嘗試原始文件分析: ${fileName}`);

  try {
    const fileBuffer = await fs.readFile(jarPath);

    // 檢查文件是否真的是ZIP格式
    const zipSignature = fileBuffer.slice(0, 4);
    const validSignatures = [
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // 標準ZIP
      Buffer.from([0x50, 0x4b, 0x05, 0x06]), // 空ZIP
      Buffer.from([0x50, 0x4b, 0x07, 0x08]), // 跨卷ZIP
    ];

    const isValidZip = validSignatures.some((sig) => zipSignature.equals(sig));

    if (!isValidZip) {
      console.log(`⚠️  文件不是標準ZIP格式，簽名: ${zipSignature.toString('hex')}`);
      // 即使不是標準格式，也嘗試基本信息提取
      return {
        filePath: jarPath,
        fileName: path.basename(jarPath),
        'MIDlet-Name': path.basename(jarPath, '.jar'),
        'MIDlet-Vendor': '未知廠商',
        'MIDlet-Version': '1.0',
        iconData: null,
        _parseMethod: 'raw_fallback',
      };
    }

    // 如果是有效的ZIP，但yauzl解析失敗，嘗試更寬松的選項
    return new Promise((resolve) => {
      yauzl.open(
        jarPath,
        {
          lazyEntries: true,
          strictFileNames: false,
          validateEntrySizes: false,
          decodeStrings: false,
        },
        (err, zipfile) => {
          if (err) {
            console.log(`🔄 寬松模式也失敗，返回基本信息`);
            resolve({
              filePath: jarPath,
              fileName: path.basename(jarPath),
              'MIDlet-Name': path.basename(jarPath, '.jar'),
              'MIDlet-Vendor': '未知廠商',
              'MIDlet-Version': '1.0',
              iconData: null,
              _parseMethod: 'basic_fallback',
            });
            return;
          }

          // 如果寬松模式成功，繼續正常解析流程
          console.log(`✅ 寬松模式成功打開文件`);
          resolve(null); // 返回null表示需要繼續用標準流程
        }
      );
    });
  } catch (error) {
    console.error(`原始文件分析失敗:`, error.message);
    // 最後的備用方案：返回基本信息
    return {
      filePath: jarPath,
      fileName: path.basename(jarPath),
      'MIDlet-Name': path.basename(jarPath, '.jar'),
      'MIDlet-Vendor': '未知廠商',
      'MIDlet-Version': '1.0',
      iconData: null,
      _parseMethod: 'emergency_fallback',
    };
  }
}

module.exports = { tryRawFileAnalysis };
