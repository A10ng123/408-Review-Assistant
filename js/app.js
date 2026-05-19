/**
 * 408 考研复习助手 — 主控制器
 * 负责：Tab 切换、视图管理、知识点浏览、自评、推荐、统计
 */

const App = {
  currentTab: 'dashboard',
  subjects: [],
  pointsMap: {},
  selectedPointId: null,

  /** 初始化应用 */
  init() {
    const data = Storage.initData();
    this.subjects = data.subjects;
    this.pointsMap = data.pointsMap;

    this.bindTabs();
    this.renderTree();
    this.renderDashboard();
    this.updateGlobalStats();
    console.log('408 考研复习助手 — 初始化完成');
  },

  /* ========== 导航切换 ========== */

  bindTabs() {
    document.querySelectorAll('.topnav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target) this.switchTab(target);
      });
    });
  },

  switchTab(tabName) {
    document.querySelectorAll('.topnav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${tabName}`);
    });
    this.currentTab = tabName;

    if (tabName === 'dashboard') this.renderDashboard();
    if (tabName === 'stats') this.renderStats();
  },

  /* ========== 仪表盘 ========== */

  renderDashboard() {
    const queue = SM2.getReviewQueue(this.pointsMap);
    const total = queue.length;

    // 统计
    const urgentCount = queue.filter(q => q.urgency > 2).length;
    const dueCount = queue.filter(q => q.urgency > -0.5).length;
    const reviewedCount = queue.filter(q => q.sm2.lastReview).length;

    // 概述区
    const summaryEl = document.getElementById('dash-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="dash-stat">
          <div class="stat-num urgent">${urgentCount}</div>
          <div class="stat-label">紧急待复习（超期3天+）</div>
        </div>
        <div class="dash-stat">
          <div class="stat-num warning">${dueCount}</div>
          <div class="stat-label">今日待复习</div>
        </div>
        <div class="dash-stat">
          <div class="stat-num normal">${reviewedCount}</div>
          <div class="stat-label">已学习知识点</div>
        </div>
      `;
    }

    // 复习队列
    const queueEl = document.getElementById('dash-queue');
    if (!queueEl) return;

    if (total === 0) {
      queueEl.innerHTML = `<div class="dash-empty"><p>数据加载中...</p></div>`;
      return;
    }

    // 只显示前 20 条需要关注的（紧急度 > -1，即已到或即将到复习时间 + 未学过的）
    const topItems = queue.filter(q => q.urgency > -1).slice(0, 20);

    if (topItems.length === 0) {
      queueEl.innerHTML = `<div class="dash-empty">
        <p>🎉 暂无需要复习的知识点</p>
        <p>去「知识点浏览」学习新的知识点吧</p>
      </div>`;
      return;
    }

    const masteryLabels = ['', '完全不会', '有点印象', '基本掌握', '完全掌握'];
    let html = `<div style="font-weight:600;margin-bottom:12px;font-size:15px;">今日复习推荐（按紧急度排序）</div>`;

    topItems.forEach(item => {
      // 紧急度等级
      let urgencyLevel, urgencyLabel, urgencyClass;
      if (item.urgency > 2) {
        urgencyLevel = 'high'; urgencyLabel = '紧急'; urgencyClass = 'urgency-tag-high';
      } else if (item.urgency > 0) {
        urgencyLevel = 'mid'; urgencyLabel = '该复习了'; urgencyClass = 'urgency-tag-mid';
      } else {
        urgencyLevel = 'low'; urgencyLabel = '未学'; urgencyClass = 'urgency-tag-low';
      }

      const lastReview = item.sm2.lastReview
        ? new Date(item.sm2.lastReview).toLocaleDateString('zh-CN')
        : '从未';

      html += `<div class="review-card urgency-${urgencyLevel}" id="review-card-${item.id}">
        <div class="review-card-info">
          <div class="review-card-name">
            ${item.name}
            <span class="review-card-urgency-tag ${urgencyClass}">${urgencyLabel}</span>
          </div>
          <div class="review-card-meta">
            ${item.subject} · 上次复习：${lastReview} · 掌握：${masteryLabels[item.mastery]}
          </div>
        </div>
        <div class="review-card-actions">
          ${[1,2,3,4].map(level => {
            const sel = item.mastery === level ? ` selected-r${level}` : '';
            return `<button class="rating-btn${sel}" data-rating="${level}" data-point="${item.id}">${masteryLabels[level]}</button>`;
          }).join('')}
        </div>
      </div>`;
    });

    if (topItems.length < queue.filter(q => q.urgency > -1).length) {
      html += `<div style="text-align:center;color:var(--color-text-secondary);padding:12px;font-size:13px;">
        仅显示最紧急的前 20 条，更多知识点请前往「知识点浏览」
      </div>`;
    }

    queueEl.innerHTML = html;

    // 绑定仪表盘中的自评按钮
    queueEl.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating);
        const pid = btn.dataset.point;
        this.ratePoint(pid, rating);
      });
    });
  },

  /* ========== 知识点树 ========== */

  renderTree() {
    const container = document.getElementById('knowledge-tree');
    if (!container) return;

    let html = '';
    this.subjects.forEach(subject => {
      html += `<div class="tree-subject" data-action="toggle" data-target="${subject.id}">
        <span class="tree-arrow" id="arrow-${subject.id}">▶</span>${subject.name}
      </div>`;
      html += `<div id="children-${subject.id}" style="display:none">`;

      subject.chapters.forEach(chapter => {
        html += `<div class="tree-chapter" data-action="toggle" data-target="${chapter.id}">
          <span class="tree-arrow" id="arrow-${chapter.id}">▶</span>${chapter.name}
        </div>`;
        html += `<div id="children-${chapter.id}" style="display:none">`;

        chapter.sections.forEach(section => {
          html += `<div class="tree-section" data-action="toggle" data-target="${section.id}">
            <span class="tree-arrow" id="arrow-${section.id}">▶</span>${section.name}
          </div>`;
          html += `<div id="children-${section.id}" style="display:none">`;

          section.points.forEach(point => {
            html += `<div class="tree-point" data-action="select" data-point="${point.id}" id="tree-point-${point.id}">
              <span class="mastery-dot m-${point.mastery}"></span>${point.name}
            </div>`;
          });

          html += `</div>`;
        });

        html += `</div>`;
      });

      html += `</div>`;
    });

    container.innerHTML = html;
    this.bindTreeEvents(container);
  },

  bindTreeEvents(container) {
    container.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      if (action === 'toggle') {
        this.toggleNode(el.dataset.target);
      } else if (action === 'select') {
        this.selectPoint(el.dataset.point);
      }
    });
  },

  toggleNode(targetId) {
    const children = document.getElementById(`children-${targetId}`);
    const arrow = document.getElementById(`arrow-${targetId}`);
    if (!children || !arrow) return;

    const isHidden = children.style.display === 'none';
    children.style.display = isHidden ? 'block' : 'none';
    arrow.classList.toggle('expanded', isHidden);
  },

  selectPoint(pointId) {
    this.selectedPointId = pointId;

    document.querySelectorAll('.tree-point.active').forEach(el => el.classList.remove('active'));
    const treeEl = document.getElementById(`tree-point-${pointId}`);
    if (treeEl) treeEl.classList.add('active');

    this.renderDetail(pointId);
  },

  /* ========== 知识点详情 ========== */

  getPointPath(pointId) {
    for (const subject of this.subjects) {
      for (const chapter of subject.chapters) {
        for (const section of chapter.sections) {
          for (const point of section.points) {
            if (point.id === pointId) {
              return `${subject.name} > ${chapter.name} > ${section.name}`;
            }
          }
        }
      }
    }
    return '';
  },

  renderDetail(pointId) {
    const point = this.pointsMap[pointId];
    if (!point) return;

    const container = document.getElementById('point-detail');
    if (!container) return;

    const masteryLabels = ['', '完全不会', '有点印象', '基本掌握', '完全掌握'];
    const path = this.getPointPath(pointId);

    let html = `<div class="detail-card">`;
    html += `<div class="point-title">${point.name}</div>`;
    html += `<div class="point-path">${path}</div>`;
    html += `<span class="point-mastery-label mastery-label-${point.mastery}">${masteryLabels[point.mastery]}</span>`;

    html += `<div class="rating-buttons">`;
    [1, 2, 3, 4].forEach(level => {
      const selected = point.mastery === level ? ` selected-r${level}` : '';
      html += `<button class="rating-btn${selected}" data-rating="${level}" data-point="${pointId}">${masteryLabels[level]}</button>`;
    });
    html += `</div>`;

    const sm2 = point.sm2;
    if (sm2.lastReview) {
      const lastDate = new Date(sm2.lastReview).toLocaleDateString('zh-CN');
      const nextDate = sm2.nextReview ? new Date(sm2.nextReview).toLocaleDateString('zh-CN') : '—';
      html += `<div class="review-info">
        上次复习：${lastDate}<br>
        下次复习：${nextDate}<br>
        当前间隔：${sm2.interval} 天 | 连续正确：${sm2.repetitions} 次
      </div>`;
    } else {
      html += `<div class="review-info">尚未复习过此知识点</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating);
        const pid = btn.dataset.point;
        this.ratePoint(pid, rating);
      });
    });
  },

  /** 知识点自评（使用 SM-2 算法计算间隔） */
  ratePoint(pointId, rating) {
    const point = this.pointsMap[pointId];
    if (!point) return;

    const now = new Date().toISOString();

    // 更新掌握程度
    point.mastery = rating;

    // 使用 SM-2 算法计算下次复习时间
    Object.assign(point.sm2, SM2.update(point.sm2, rating));

    // 记录历史
    point.reviewHistory.push({ date: now, rating });

    // 保存
    Storage.saveUserData(this.pointsMap);

    // 刷新界面
    this.renderDetail(pointId);
    this.updatePointTreeDot(pointId);
    this.updateGlobalStats();

    // 如果在仪表盘，也刷新仪表盘
    if (this.currentTab === 'dashboard') {
      this.renderDashboard();
    }
  },

  updatePointTreeDot(pointId) {
    const point = this.pointsMap[pointId];
    const el = document.getElementById(`tree-point-${pointId}`);
    if (!el || !point) return;
    const dot = el.querySelector('.mastery-dot');
    if (dot) {
      dot.className = `mastery-dot m-${point.mastery}`;
    }
  },

  /* ========== 统计面板 ========== */

  renderStats() {
    const container = document.getElementById('stats-container');
    if (!container) return;

    const overall = Storage.getStats(this.pointsMap);
    const pct = Math.round((overall.mastered / overall.total) * 100);

    // 各科统计
    const subjectStats = this.subjects.map(subj => {
      let total = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0;
      subj.chapters.forEach(ch => {
        ch.sections.forEach(sec => {
          sec.points.forEach(p => {
            total++;
            const pt = this.pointsMap[p.id];
            const mastery = pt ? pt.mastery : 1;
            if (mastery === 1) m1++;
            else if (mastery === 2) m2++;
            else if (mastery === 3) m3++;
            else if (mastery === 4) m4++;
          });
        });
      });
      const learned = m2 + m3 + m4;
      const learnedPct = Math.round((learned / total) * 100);
      const masterPct = Math.round((m4 / total) * 100);
      return { name: subj.name, total, m1, m2, m3, m4, learned, learnedPct, masterPct };
    });

    let html = '';

    // 总体概览
    html += `<div class="stats-overview">
      <div class="stats-overview-item">
        <div class="stats-overview-num">${overall.total}</div>
        <div class="stats-overview-label">知识点总数</div>
      </div>
      <div class="stats-overview-item">
        <div class="stats-overview-num">${overall.learned}</div>
        <div class="stats-overview-label">已学知识点</div>
      </div>
      <div class="stats-overview-item">
        <div class="stats-overview-num">${pct}%</div>
        <div class="stats-overview-label">整体掌握率</div>
      </div>
      <div class="stats-overview-item">
        <div class="stats-overview-num">${overall.notLearned}</div>
        <div class="stats-overview-label">尚未学习</div>
      </div>
    </div>`;

    // 掌握度分布
    html += `<div class="stats-section-title">掌握程度分布</div>`;
    html += `<div class="stats-distribution">
      <div class="stat-dist-card">
        <div class="stat-dist-num" style="color:var(--color-success)">${overall.mastered}</div>
        <div class="stat-dist-label">完全掌握</div>
        <div class="stat-dist-bar bar-success" style="width:100%"></div>
      </div>
      <div class="stat-dist-card">
        <div class="stat-dist-num" style="color:var(--color-warning)">${overall.basic}</div>
        <div class="stat-dist-label">基本掌握</div>
        <div class="stat-dist-bar bar-warning" style="width:100%"></div>
      </div>
      <div class="stat-dist-card">
        <div class="stat-dist-num" style="color:var(--color-caution)">${overall.impression}</div>
        <div class="stat-dist-label">有点印象</div>
        <div class="stat-dist-bar bar-caution" style="width:100%"></div>
      </div>
      <div class="stat-dist-card">
        <div class="stat-dist-num" style="color:var(--color-danger)">${overall.notLearned}</div>
        <div class="stat-dist-label">完全不会</div>
        <div class="stat-dist-bar bar-danger" style="width:100%"></div>
      </div>
    </div>`;

    // 各科进度
    html += `<div class="stats-section-title">各科学习进度</div>`;
    html += `<div class="stats-subjects">`;

    subjectStats.forEach(s => {
      // 进度条颜色：根据掌握率
      let fillClass = 'fill-danger';
      if (s.learnedPct >= 75) fillClass = 'fill-success';
      else if (s.learnedPct >= 50) fillClass = 'fill-warning';
      else if (s.learnedPct >= 25) fillClass = 'fill-caution';

      html += `<div class="stat-subject-card">
        <div class="stat-subject-header">
          <span class="stat-subject-name">${s.name}</span>
          <span class="stat-subject-pct">${s.learnedPct}%（已学 ${s.learned}/${s.total}）</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${fillClass}" style="width:${Math.max(s.learnedPct, 3)}%"></div>
        </div>
        <div class="stat-subject-detail">
          <span style="color:var(--color-success)">完全掌握 ${s.m4}</span>
          <span style="color:var(--color-warning)">基本掌握 ${s.m3}</span>
          <span style="color:var(--color-caution)">有点印象 ${s.m2}</span>
          <span style="color:var(--color-danger)">完全不会 ${s.m1}</span>
        </div>
      </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
  },

  updateGlobalStats() {
    const stats = Storage.getStats(this.pointsMap);
    this.updateStatus(
      `已加载 ${stats.total} 个知识点 | 已学 ${stats.learned} 个 | 掌握率 ${Math.round((stats.mastered / stats.total) * 100)}%`
    );
  },

  updateStatus(msg) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = msg;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
