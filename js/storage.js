/**
 * 408 考研复习助手 — 数据持久化模块
 * 负责：localStorage 读写、预置数据与用户数据合并
 */

const Storage = {
  USER_DATA_KEY: 'kr_user_data',
  SETTINGS_KEY: 'kr_settings',

  /**
   * 初始化知识点数据
   * 将预置考纲展开为扁平的知识点列表，合并用户数据
   * @returns {Object} { subjects, pointsMap }
   */
  initData() {
    const userData = this.loadUserData();
    const subjects = JSON.parse(JSON.stringify(KaoGang)); // 深拷贝预置数据
    const pointsMap = {}; // id → 运行时知识点对象

    subjects.forEach(subject => {
      subject.chapters.forEach(chapter => {
        chapter.sections.forEach(section => {
          section.points.forEach(point => {
            // 合并用户数据
            const saved = userData[point.id];
            if (saved) {
              point.mastery = saved.mastery;
              point.description = saved.description || '';
              point.sm2 = saved.sm2;
              point.reviewHistory = saved.reviewHistory || [];
            } else {
              // 默认值
              point.mastery = 1; // 完全不会
              point.description = '';
              point.sm2 = {
                interval: 1,
                repetitions: 0,
                easeFactor: 2.5,
                nextReview: null,
                lastReview: null
              };
              point.reviewHistory = [];
            }
            pointsMap[point.id] = point;
          });
        });
      });
    });

    return { subjects, pointsMap };
  },

  /** 从 localStorage 加载用户数据 */
  loadUserData() {
    try {
      const raw = localStorage.getItem(this.USER_DATA_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('加载用户数据失败，使用空数据', e);
      return {};
    }
  },

  /** 保存用户数据到 localStorage */
  saveUserData(pointsMap) {
    const userData = {};
    Object.values(pointsMap).forEach(point => {
      userData[point.id] = {
        mastery: point.mastery,
        description: point.description || '',
        sm2: point.sm2,
        reviewHistory: point.reviewHistory
      };
    });
    try {
      localStorage.setItem(this.USER_DATA_KEY, JSON.stringify(userData));
    } catch (e) {
      console.error('保存数据失败', e);
    }
  },

  /* ========== 思维导图数据 ========== */

  MINDMAP_KEY: 'kr_mindmaps',

  /** 加载所有思维导图数据 */
  loadMindmapData() {
    try {
      const raw = localStorage.getItem(this.MINDMAP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('加载思维导图数据失败', e);
      return {};
    }
  },

  /** 保存一个科目的思维导图 */
  saveMindmapData(subjectId, nodes) {
    const data = this.loadMindmapData();
    data[subjectId] = { nodes };
    try {
      localStorage.setItem(this.MINDMAP_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('保存思维导图失败', e);
    }
  },

  /** 导出一个知识点的用户数据 */
  exportPointData(point) {
    return {
      id: point.id,
      mastery: point.mastery,
      description: point.description,
      sm2: point.sm2,
      reviewHistory: point.reviewHistory
    };
  },

  /** 导出全部用户数据（JSON 文件下载） */
  exportAll() {
    const userData = this.loadUserData();
    const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `408-review-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** 导入用户数据：校验 JSON 并合并到 localStorage */
  importData(jsonData) {
    // 校验：顶层必须是对象
    if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
      return { success: false, imported: 0, skipped: 0, error: '数据格式错误：需要 JSON 对象' };
    }

    let imported = 0;
    let skipped = 0;

    // 加载现有本地数据
    const existing = this.loadUserData();

    // 遍历导入的数据
    Object.entries(jsonData).forEach(([key, entry]) => {
      // 校验：每条记录必须包含必要字段
      if (!entry || typeof entry !== 'object') {
        skipped++;
        return;
      }
      if (typeof entry.mastery !== 'number' || !entry.sm2 || typeof entry.sm2 !== 'object') {
        skipped++;
        return;
      }

      // 合并：导入数据覆盖本地已有，保留本地独有的
      existing[key] = {
        mastery: entry.mastery,
        description: entry.description || '',
        sm2: {
          interval: entry.sm2.interval || 1,
          repetitions: entry.sm2.repetitions || 0,
          easeFactor: entry.sm2.easeFactor || 2.5,
          nextReview: entry.sm2.nextReview || null,
          lastReview: entry.sm2.lastReview || null
        },
        reviewHistory: Array.isArray(entry.reviewHistory) ? entry.reviewHistory : []
      };
      imported++;
    });

    // 保存合并后的数据
    try {
      localStorage.setItem(this.USER_DATA_KEY, JSON.stringify(existing));
    } catch (e) {
      return { success: false, imported: 0, skipped: 0, error: '存储空间不足' };
    }

    return { success: true, imported, skipped };
  },

  /** 获取总知识点数量统计 */
  getStats(pointsMap) {
    const total = Object.keys(pointsMap).length;
    let learned = 0;
    let mastered = 0;
    let basic = 0;
    let impression = 0;
    let notLearned = 0;

    Object.values(pointsMap).forEach(p => {
      if (p.mastery >= 2) learned++; // 有点印象以上算"已学"
      if (p.mastery === 4) mastered++;
      else if (p.mastery === 3) basic++;
      else if (p.mastery === 2) impression++;
      else notLearned++;
    });

    return { total, learned, mastered, basic, impression, notLearned };
  }
};
