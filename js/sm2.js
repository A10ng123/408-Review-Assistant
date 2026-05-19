/**
 * SM-2 间隔重复算法实现
 *
 * 参考：Piotr Wozniak 的 SuperMemo SM-2 算法
 * 将用户四档自评映射为 SM-2 质量分，计算下次复习间隔
 */

const SM2 = {
  // 质量分下限
  MIN_EF: 1.3,

  /**
   * 用户评分 → SM-2 质量分
   *   完全不会(1) → 0
   *   有点印象(2) → 2
   *   基本掌握(3) → 4
   *   完全掌握(4) → 5
   */
  ratingToQuality(rating) {
    const map = { 1: 0, 2: 2, 3: 4, 4: 5 };
    return map[rating] ?? 0;
  },

  /**
   * 计算知识点的紧急度（用于排序推荐）
   * 返回值越大越紧急
   *
   * 逻辑：
   *   - 从未复习过 → 基础紧急度（根据 mastery 越低越急）
   *   - 已过 nextReview → 超期天数 / interval，越超期越急
   *   - 未到 nextReview → 负值（不紧急）
   */
  calcUrgency(sm2, mastery) {
    // 从未复习
    if (!sm2.nextReview) {
      return 5 - mastery; // mastery=1 得 4（最急），mastery=4 得 1
    }

    const now = new Date();
    const next = new Date(sm2.nextReview);
    const overdueDays = Math.floor((now - next) / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) {
      // 未到复习时间，不紧急
      return -1;
    }

    // 超期越久越紧急，间隔越短越紧急（因为说明还没掌握牢）
    const interval = Math.max(sm2.interval, 1);
    return overdueDays / interval + (4 - mastery) * 0.5;
  },

  /**
   * SM-2 核心计算
   * @param {Object} sm2 - 当前 SM-2 状态 { interval, repetitions, easeFactor, lastReview }
   * @param {number} rating - 用户自评 (1-4)
   * @returns {Object} 更新后的 SM-2 状态
   */
  update(sm2, rating) {
    const q = this.ratingToQuality(rating);
    const now = new Date().toISOString();
    const result = {
      interval: sm2.interval,
      repetitions: sm2.repetitions,
      easeFactor: sm2.easeFactor,
      lastReview: now
    };

    if (q < 3) {
      // 评分低，重置
      result.repetitions = 0;
      result.interval = 1;
    } else {
      // 评分合格，推进间隔
      result.repetitions = sm2.repetitions + 1;

      if (result.repetitions === 1) {
        result.interval = 1;
      } else if (result.repetitions === 2) {
        result.interval = 3;
      } else {
        result.interval = Math.round(sm2.interval * sm2.easeFactor);
      }
    }

    // 更新 easeFactor
    const newEF = sm2.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    result.easeFactor = Math.max(this.MIN_EF, Math.round(newEF * 100) / 100);

    // 计算下次复习日期
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + result.interval);
    result.nextReview = nextDate.toISOString();

    return result;
  },

  /**
   * 按紧急度排序知识点
   * @param {Object} pointsMap - id → point 映射
   * @returns {Array} 排序后的知识点数组 [{ id, name, urgency, ... }]
   */
  getReviewQueue(pointsMap) {
    const queue = [];

    Object.values(pointsMap).forEach(point => {
      const urgency = this.calcUrgency(point.sm2, point.mastery);
      // 获取所属科目
      let subject = '';
      for (const subj of window.App?.subjects || []) {
        for (const ch of subj.chapters) {
          for (const sec of ch.sections) {
            const found = sec.points.find(p => p.id === point.id);
            if (found) { subject = subj.name; break; }
          }
          if (subject) break;
        }
        if (subject) break;
      }

      queue.push({
        id: point.id,
        name: point.name,
        subject,
        mastery: point.mastery,
        sm2: point.sm2,
        urgency
      });
    });

    // 按紧急度降序排列
    queue.sort((a, b) => b.urgency - a.urgency);
    return queue;
  }
};
