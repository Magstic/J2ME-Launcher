// 讀取 ZIP 檔案項目內容（文字或二進位）
function readEntryContent(zipfile, entry, isBinary = false) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err);
      const chunks = [];
      readStream.on('data', (chunk) => chunks.push(chunk));
      readStream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(isBinary ? buffer : buffer.toString());
      });
      readStream.on('error', reject);
    });
  });
}

module.exports = { readEntryContent };
