// src/main/sql/clusters-write.js
// Write helpers for clusters and cluster-game relationships.
// Linus-style: simple, explicit, transactional.

const { getDB } = require('../db');
const path = require('path');
const { randomUUID } = require('crypto');

function normalizePathInput(p) {
  if (!p || typeof p !== 'string') return p;
  const n = path.normalize(p);
  return process.platform === 'win32' ? n.replace(/\//g, '\\') : n;
}

// 刪除所有“真空簇”（沒有任何成員的簇）。不影響僅“不可見”的情況（例如目錄被禁用）。
function cleanupOrphanClusters() {
  const db = getDB();
  const stmt = db.prepare(`
    DELETE FROM clusters
    WHERE NOT EXISTS (
      SELECT 1 FROM cluster_games cg WHERE cg.clusterId = clusters.id
    )
  `);
  const res = stmt.run();
  return { success: true, deleted: res.changes || 0 };
}

function nowISO() {
  return new Date().toISOString();
}

// Create a cluster and optionally add initial members (all-or-nothing transaction)
function createCluster(payload = {}) {
  const db = getDB();
  const id = randomUUID();
  const name = (payload.name || '').trim();
  const description = payload.description || null;
  const icon = payload.icon || null;
  const givenPrimary = normalizePathInput(payload.primaryFilePath || null);
  const filePaths = Array.isArray(payload.filePaths)
    ? payload.filePaths.map(normalizePathInput).filter(Boolean)
    : [];
  const createdAt = nowISO();
  const updatedAt = createdAt;

  const insertCluster = db.prepare(`
    INSERT INTO clusters (id, name, description, icon, primaryFilePath, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const ensureGame = db.prepare(`INSERT OR IGNORE INTO games (filePath) VALUES (?)`);
  const insertMember = db.prepare(`
    INSERT INTO cluster_games (clusterId, filePath, addedTime, role, tags)
    VALUES (?, ?, ?, NULL, NULL)
  `);
  const setPrimary = db.prepare(`UPDATE clusters SET primaryFilePath=? , updatedAt=? WHERE id=?`);

  const tx = db.transaction(() => {
    insertCluster.run(id, name, description, icon, null, createdAt, updatedAt);

    let inserted = 0;
    let firstInserted = null;
    for (const fp of filePaths) {
      try {
        ensureGame.run(fp);
      } catch (_) {}
      try {
        insertMember.run(id, fp, createdAt);
        inserted++;
        if (!firstInserted) firstInserted = fp;
      } catch (e) {
        // 若該遊戲已屬於其他簇（UNIQUE(filePath)），則跳過，不中斷整個建立流程
        const msg = String(e && e.message ? e.message : e);
        const isUnique = /UNIQUE|unique|constraint/i.test(msg);
        if (!isUnique) throw e; // 其他錯誤則中止交易
      }
    }

    if (inserted === 0) {
      // 不建立空簇：回滾（透過丟出錯誤讓交易撤銷）
      throw new Error('E_UNIQUE_MEMBER: all');
    }

    // 設定主成員：優先使用 payload.primaryFilePath，其次使用實際成功插入的第一個成員
    const primary = givenPrimary || firstInserted || null;
    if (primary) {
      const exists = db
        .prepare(`SELECT 1 FROM cluster_games WHERE clusterId=? AND filePath=?`)
        .get(id, primary);
      if (exists) setPrimary.run(primary, nowISO(), id);
    }

    // 若未提供名稱，則從簇成員中隨機挑選一個遊戲名稱作為預設名稱
    if (!name) {
      try {
        const pick = db
          .prepare(
            `
          SELECT g.gameName AS n
          FROM cluster_games cg
          JOIN games g ON g.filePath = cg.filePath COLLATE NOCASE
          WHERE cg.clusterId = ?
            AND g.gameName IS NOT NULL AND TRIM(g.gameName) <> ''
          ORDER BY RANDOM()
          LIMIT 1
        `
          )
          .get(id);
        const picked = pick && pick.n ? pick.n : null;
        const finalName = picked || 'Cluster';
        db.prepare(`UPDATE clusters SET name=?, updatedAt=? WHERE id=?`).run(
          finalName,
          nowISO(),
          id
        );
      } catch (_) {
        // 忽略命名失敗，保持為空或預設
      }
    }
  });

  tx();
  return { success: true, clusterId: id };
}

// Add games to an existing cluster (transaction). Throws if any member already belongs to another cluster.
function addGamesToCluster(clusterId, filePaths) {
  const db = getDB();
  const fps = Array.isArray(filePaths) ? filePaths.map(normalizePathInput).filter(Boolean) : [];
  if (fps.length === 0) return { success: true, added: 0 };

  const ensureGame = db.prepare(`INSERT OR IGNORE INTO games (filePath) VALUES (?)`);
  const insertMember = db.prepare(`
    INSERT INTO cluster_games (clusterId, filePath, addedTime, role, tags)
    VALUES (?, ?, ?, NULL, NULL)
  `);

  const tx = db.transaction(() => {
    const t = nowISO();
    for (const fp of fps) {
      try {
        ensureGame.run(fp);
      } catch (_) {}
      try {
        insertMember.run(clusterId, fp, t);
      } catch (e) {
        throw new Error(`E_UNIQUE_MEMBER: ${fp}`);
      }
    }
  });

  tx();
  return { success: true, added: fps.length };
}

function removeGameFromCluster(clusterId, filePath) {
  const db = getDB();
  const fp = normalizePathInput(filePath);
  const del = db.prepare(`DELETE FROM cluster_games WHERE clusterId=? AND filePath=?`);
  const res = del.run(clusterId, fp);
  // 如果移除的是主成員，將 primaryFilePath 置空
  try {
    const row = db.prepare(`SELECT primaryFilePath FROM clusters WHERE id=?`).get(clusterId);
    if (row && row.primaryFilePath === fp) {
      db.prepare(`UPDATE clusters SET primaryFilePath=NULL, updatedAt=? WHERE id=?`).run(
        nowISO(),
        clusterId
      );
    }
  } catch (_) {}
  // 如果簇已無任何成員，則自動刪除該簇（符合“空簇不保留”的預期）
  let clusterDeleted = 0;
  try {
    const cntRow = db
      .prepare(`SELECT COUNT(1) AS c FROM cluster_games WHERE clusterId=?`)
      .get(clusterId);
    const cnt = cntRow && typeof cntRow.c === 'number' ? cntRow.c : 0;
    if (cnt === 0) {
      const delCluster = db.prepare(`DELETE FROM clusters WHERE id=?`).run(clusterId);
      clusterDeleted = delCluster.changes || 0;
    }
  } catch (_) {}
  return { success: true, removed: res.changes || 0, clusterDeleted };
}

// Update member tags JSON for a specific game within a cluster
function updateClusterMemberTags(clusterId, filePath, tags) {
  const db = getDB();
  const fp = normalizePathInput(filePath);
  let tagsJson = null;
  try {
    tagsJson = tags == null ? null : JSON.stringify(tags);
  } catch (_) {
    tagsJson = null;
  }
  const res = db
    .prepare(`UPDATE cluster_games SET tags=? WHERE clusterId=? AND filePath=?`)
    .run(tagsJson, clusterId, fp);
  return { success: true, updated: res.changes || 0 };
}

// Set a member game as the primary of the cluster (affects effective icon)
function setClusterPrimary(clusterId, filePath) {
  const db = getDB();
  const fp = normalizePathInput(filePath);
  const exists = db
    .prepare(`SELECT 1 FROM cluster_games WHERE clusterId=? AND filePath=?`)
    .get(clusterId, fp);
  if (!exists) throw new Error('E_PRIMARY_NOT_MEMBER');
  const res = db
    .prepare(`UPDATE clusters SET primaryFilePath=?, updatedAt=? WHERE id=?`)
    .run(fp, nowISO(), clusterId);
  return { success: true, updated: res.changes || 0 };
}

function updateCluster(payload = {}) {
  const db = getDB();
  const { id } = payload;
  if (!id) throw new Error('E_MISSING_ID');

  // allow partial update
  const fields = [];
  const params = [];
  if (payload.name !== undefined) {
    fields.push('name=?');
    params.push(payload.name);
  }
  if (payload.description !== undefined) {
    fields.push('description=?');
    params.push(payload.description);
  }
  if (payload.icon !== undefined) {
    fields.push('icon=?');
    params.push(payload.icon);
  }
  if (payload.primaryFilePath !== undefined) {
    const fp = payload.primaryFilePath ? normalizePathInput(payload.primaryFilePath) : null;
    if (fp) {
      const ok = db
        .prepare(`SELECT 1 FROM cluster_games WHERE clusterId=? AND filePath=?`)
        .get(id, fp);
      if (!ok) throw new Error('E_PRIMARY_NOT_MEMBER');
      fields.push('primaryFilePath=?');
      params.push(fp);
    } else {
      fields.push('primaryFilePath=NULL');
    }
  }
  fields.push('updatedAt=?');
  params.push(nowISO());
  params.push(id);

  const sql = `UPDATE clusters SET ${fields.join(', ')} WHERE id=?`;
  const res = db.prepare(sql).run(...params);
  return { success: true, updated: res.changes || 0 };
}

function deleteCluster(id) {
  const db = getDB();
  const res = db.prepare(`DELETE FROM clusters WHERE id=?`).run(id);
  // ON DELETE CASCADE 清理 cluster_games 與 folder_clusters
  return { success: true, deleted: res.changes || 0 };
}

// Merge clusters: move all members and folder links from source (fromId) to target (toId)
function mergeClusters(fromId, toId) {
  if (!fromId || !toId) throw new Error('E_MERGE_IDS_REQUIRED');
  if (fromId === toId) return { success: true, moved: 0, linked: 0, deleted: 0 };
  const db = getDB();

  const tx = db.transaction(() => {
    // Ensure target exists
    const tgt = db.prepare(`SELECT id, primaryFilePath FROM clusters WHERE id=?`).get(toId);
    if (!tgt) throw new Error('E_TARGET_NOT_FOUND');
    const src = db.prepare(`SELECT id, primaryFilePath FROM clusters WHERE id=?`).get(fromId);
    if (!src) throw new Error('E_SOURCE_NOT_FOUND');

    // Move members: update clusterId from source to target
    // This respects UNIQUE(filePath) across cluster_games since each filePath exists only once.
    const beforeCountRow = db
      .prepare(`SELECT COUNT(1) AS c FROM cluster_games WHERE clusterId=?`)
      .get(fromId);
    const beforeMoved = beforeCountRow ? beforeCountRow.c : 0;
    db.prepare(`UPDATE cluster_games SET clusterId=? WHERE clusterId=?`).run(toId, fromId);

    // Merge folder links: insert missing links then delete source links
    db.prepare(
      `
      INSERT OR IGNORE INTO folder_clusters (folderId, clusterId, addedTime)
      SELECT folderId, ?, COALESCE(addedTime, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      FROM folder_clusters WHERE clusterId=?
    `
    ).run(toId, fromId);
    const delFolder = db.prepare(`DELETE FROM folder_clusters WHERE clusterId=?`).run(fromId);

    // Primary handling: keep target primary if set; if not set, adopt source primary if exists and now a member of target
    if (!tgt.primaryFilePath && src.primaryFilePath) {
      const exists = db
        .prepare(`SELECT 1 FROM cluster_games WHERE clusterId=? AND filePath=?`)
        .get(toId, src.primaryFilePath);
      if (exists) {
        db.prepare(`UPDATE clusters SET primaryFilePath=?, updatedAt=? WHERE id=?`).run(
          src.primaryFilePath,
          nowISO(),
          toId
        );
      }
    }

    // Delete source cluster (CASCADE cleans up any residual edges)
    const del = db.prepare(`DELETE FROM clusters WHERE id=?`).run(fromId);

    return { moved: beforeMoved, linked: delFolder.changes || 0, deleted: del.changes || 0 };
  });

  const result = tx();
  return { success: true, ...result };
}

function addClusterToFolder(folderId, clusterId) {
  const db = getDB();
  const t = nowISO();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO folder_clusters (folderId, clusterId, addedTime)
    VALUES (?, ?, ?)
  `);
  const res = stmt.run(folderId, clusterId, t);
  return { success: true, added: res.changes || 0 };
}

function removeClusterFromFolder(folderId, clusterId) {
  const db = getDB();
  const stmt = db.prepare(`DELETE FROM folder_clusters WHERE folderId=? AND clusterId=?`);
  const res = stmt.run(folderId, clusterId);
  return { success: true, removed: res.changes || 0 };
}

module.exports = {
  createCluster,
  addGamesToCluster,
  removeGameFromCluster,
  updateCluster,
  deleteCluster,
  addClusterToFolder,
  removeClusterFromFolder,
  updateClusterMemberTags,
  setClusterPrimary,
  mergeClusters,
  cleanupOrphanClusters,
};
