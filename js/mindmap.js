/**
 * 408 考研复习助手 — 思维导图模块
 * 负责：四科独立思维导图的渲染、交互、持久化
 * 方案 B：DOM 自由节点 + SVG 贝塞尔连线
 */

const MindMap = {
  currentSubject: 'ds',
  subjects: [
    { id: 'ds', name: '数据结构' },
    { id: 'co', name: '计算机组成原理' },
    { id: 'os', name: '操作系统' },
    { id: 'cn', name: '计算机网络' }
  ],
  nodes: [],          // 当前科目的节点数组
  scale: 1,
  panX: 0, panY: 0,   // 画布平移偏移（像素）
  dragging: null,     // 正在拖拽的节点 id
  dragStartX: 0, dragStartY: 0,
  nodeStartX: 0, nodeStartY: 0,
  panning: false,     // 是否正在平移画布
  panStartX: 0, panStartY: 0,
  panFromX: 0, panFromY: 0,

  /* ========== 预置数据 ========== */

  /** 预置四科基础导图结构 */
  getPresets() {
    // 布局参数：根节点在上，子节点水平展开
    const rootY = 70, childY = 190, spacing = 140;

    const dsChildren = ['绪论', '线性表', '栈和队列', '串', '树与二叉树', '图', '查找', '排序'];
    const coChildren = ['计算机系统概述', '数据表示和运算', '存储系统', '指令系统', '中央处理器', '总线', '输入/输出系统'];
    const osChildren = ['操作系统概述', '进程管理', '内存管理', '文件管理', '输入/输出管理'];
    const cnChildren = ['网络体系结构', '物理层', '数据链路层', '网络层', '传输层', '应用层'];

    const makeNodes = (rootName, children) => {
      const nodes = [];
      let id = 1;
      nodes.push({ id: String(id++), text: rootName, x: 0, y: rootY, parent: null, pointId: null });

      const total = children.length;
      const startX = -((total - 1) * spacing) / 2;
      children.forEach((name, i) => {
        nodes.push({
          id: String(id++),
          text: name,
          x: startX + i * spacing,
          y: childY,
          parent: '1',
          pointId: null
        });
      });
      return nodes;
    };

    return {
      ds: { nodes: makeNodes('数据结构', dsChildren) },
      co: { nodes: makeNodes('计算机组成原理', coChildren) },
      os: { nodes: makeNodes('操作系统', osChildren) },
      cn: { nodes: makeNodes('计算机网络', cnChildren) }
    };
  },

  /* ========== 初始化 ========== */

  init() {
    this.bindSubjectTabs();
    this.bindToolbar();
    this.bindCanvasEvents();
    this.loadSubject(this.currentSubject);
  },

  /** 加载并渲染指定科目 */
  loadSubject(subjId) {
    let data = Storage.loadMindmapData();
    // 首次使用：写入预置数据
    if (!data[subjId]) {
      const presets = this.getPresets();
      if (presets[subjId]) {
        data[subjId] = presets[subjId];
      } else {
        data[subjId] = { nodes: [] };
      }
      Storage.saveMindmapData(subjId, data[subjId].nodes);
    }
    this.nodes = data[subjId].nodes;
    this.renderAll();
  },

  /** 保存当前科目数据 */
  save() {
    Storage.saveMindmapData(this.currentSubject, this.nodes);
  },

  /* ========== 渲染 ========== */

  renderAll() {
    this.renderLines();
    this.renderNodes();
  },

  renderNodes() {
    const canvas = document.getElementById('mindmap-canvas');
    if (!canvas) return;

    let html = '';
    this.nodes.forEach(node => {
      const hasLink = node.pointId ? ' has-link' : '';
      html += `<div class="mm-node${hasLink}" data-node-id="${node.id}"
        style="left:${node.x - 60}px;top:${node.y - 18}px">
        ${node.text}
        ${node.pointId ? '<span class="mm-link-icon">🔗</span>' : ''}
      </div>`;
    });
    canvas.innerHTML = html;

    // 绑定节点事件
    canvas.querySelectorAll('.mm-node').forEach(el => {
      const nodeId = el.dataset.nodeId;
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); this.addChild(nodeId); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.showContextMenu(e, nodeId); });
      el.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.target.closest('.mm-link-icon')) this.startDrag(e, nodeId); });
      // 关联图标点击 → 跳转知识点
      el.querySelector('.mm-link-icon')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.jumpToPoint(nodeId);
      });
    });
  },

  renderLines() {
    const svg = document.getElementById('mindmap-svg');
    if (!svg) return;

    // SVG 需要足够的尺寸覆盖所有节点（支持负坐标）
    const size = 4000;
    const half = size / 2;
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `-${half} -${half} ${size} ${size}`);
    svg.style.width = size + 'px';
    svg.style.height = size + 'px';

    let paths = '';
    const nodeMap = {};
    this.nodes.forEach(n => { nodeMap[n.id] = n; });

    this.nodes.forEach(node => {
      if (!node.parent) return;
      const parent = nodeMap[node.parent];
      if (!parent) return;

      // 贝塞尔曲线：从父节点底部到子节点顶部
      const x1 = parent.x;
      const y1 = parent.y + 20;  // 父节点底部
      const x2 = node.x;
      const y2 = node.y - 20;    // 子节点顶部
      const cy = Math.abs(y2 - y1) * 0.5;

      paths += `<path class="mm-line" d="M${x1},${y1} C${x1},${y1 + cy} ${x2},${y2 - cy} ${x2},${y2}"/>`;
    });

    svg.innerHTML = paths;
  },

  /* ========== 节点操作 ========== */

  /** 添加子节点 */
  addChild(parentId) {
    const parent = this.nodes.find(n => n.id === parentId);
    if (!parent) return;
    if (this.nodes.length >= 200) { alert('节点数已达上限（200个）'); return; }

    // 计算新节点位置（在父节点下方偏移）
    const siblings = this.nodes.filter(n => n.parent === parentId);
    const offsetX = siblings.length * 130 - ((siblings.length - 1) * 130) / 2;
    const maxId = Math.max(...this.nodes.map(n => parseInt(n.id)), 0);
    const newNode = {
      id: String(maxId + 1),
      text: '新节点',
      x: parent.x + offsetX,
      y: parent.y + 120,
      parent: parentId,
      pointId: null
    };
    this.nodes.push(newNode);
    this.save();
    this.renderAll();
  },

  /** 编辑节点文字 */
  editNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const canvas = document.getElementById('mindmap-canvas');
    // 移除旧编辑框
    const oldEdit = document.querySelector('.mm-node-edit');
    if (oldEdit) oldEdit.remove();

    const inputDiv = document.createElement('div');
    inputDiv.className = 'mm-node-edit';
    inputDiv.style.cssText = `left:${node.x - 60}px;top:${node.y - 18}px;`;
    inputDiv.innerHTML = `<input type="text" value="${this.escapeHtml(node.text)}">`;
    canvas.appendChild(inputDiv);
    const input = inputDiv.querySelector('input');
    input.focus();
    input.select();

    const finish = () => {
      const newText = input.value.trim();
      if (newText && newText !== node.text) {
        node.text = newText;
        this.save();
        this.renderAll();
      } else {
        inputDiv.remove();
        this.renderAll();
      }
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') { inputDiv.remove(); this.renderAll(); } });
  },

  /** 删除节点及其子节点 */
  deleteNode(nodeId) {
    const toDelete = new Set();
    const collectChildren = (id) => {
      toDelete.add(id);
      this.nodes.filter(n => n.parent === id).forEach(child => collectChildren(child.id));
    };
    collectChildren(nodeId);

    if (toDelete.size > 1) {
      if (!confirm(`将删除 ${toDelete.size} 个节点（含子节点），确定？`)) return;
    }
    this.nodes = this.nodes.filter(n => !toDelete.has(n.id));
    this.save();
    this.renderAll();
  },

  /* ========== 拖拽 ========== */

  startDrag(e, nodeId) {
    this.dragging = nodeId;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      this.nodeStartX = node.x;
      this.nodeStartY = node.y;
    }
    const canvas = document.getElementById('mindmap-canvas');
    if (canvas) {
      const el = canvas.querySelector(`[data-node-id="${nodeId}"]`);
      if (el) el.classList.add('dragging');
    }
    const wrapper = document.querySelector('.mindmap-canvas-wrapper');
    if (wrapper) wrapper.classList.add('dragging-node');

    const onMove = (e2) => {
      if (this.dragging !== nodeId) return;
      const dx = (e2.clientX - this.dragStartX) / this.scale;
      const dy = (e2.clientY - this.dragStartY) / this.scale;
      const node = this.nodes.find(n => n.id === nodeId);
      if (node) {
        node.x = this.nodeStartX + dx;
        node.y = this.nodeStartY + dy;
        // 实时更新 DOM
        const el = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (el) {
          el.style.left = (node.x - 60) + 'px';
          el.style.top = (node.y - 18) + 'px';
        }
        this.renderLines();
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const el = document.querySelector(`[data-node-id="${nodeId}"]`);
      if (el) el.classList.remove('dragging');
      if (wrapper) wrapper.classList.remove('dragging-node');
      this.dragging = null;
      this.save();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* ========== 右键菜单 ========== */

  showContextMenu(e, nodeId) {
    const oldMenu = document.querySelector('.mm-context-menu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'mm-context-menu';
    menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;`;
    menu.innerHTML = `
      <div class="mm-menu-item" data-action="add">➕ 添加子节点</div>
      <div class="mm-menu-item" data-action="edit">✏️ 编辑文字</div>
      <div class="mm-menu-item" data-action="link">🔗 关联知识点</div>
      <div class="mm-menu-divider"></div>
      <div class="mm-menu-item danger" data-action="delete">🗑️ 删除节点</div>
    `;
    document.body.appendChild(menu);

    menu.querySelectorAll('.mm-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        menu.remove();
        const action = item.dataset.action;
        if (action === 'add') this.addChild(nodeId);
        else if (action === 'edit') this.editNode(nodeId);
        else if (action === 'link') this.linkPoint(nodeId);
        else if (action === 'delete') this.deleteNode(nodeId);
      });
    });

    // 点击其他区域关闭菜单
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  },

  /* ========== 知识点关联 ========== */

  /** 打开关联搜索面板 */
  linkPoint(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    this.closeLinkPanel();

    const wrapper = document.querySelector('.mindmap-canvas-wrapper');
    if (!wrapper) return;

    const panel = document.createElement('div');
    panel.className = 'mm-link-panel';
    const currentPoint = node.pointId ? App.pointsMap[node.pointId] : null;
    panel.innerHTML = `
      <div class="mm-link-panel-header">关联知识点</div>
      ${currentPoint ? `<div class="mm-link-current">当前：${currentPoint.name} <span class="mm-link-remove">✕</span></div>` : ''}
      <input class="mm-link-search" placeholder="输入关键词搜索知识点...">
      <div class="mm-link-results"></div>
    `;
    wrapper.appendChild(panel);

    const input = panel.querySelector('.mm-link-search');
    const resultsDiv = panel.querySelector('.mm-link-results');

    // 输入搜索
    let searchTimer;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const kw = input.value.trim();
        if (!kw) { resultsDiv.innerHTML = ''; return; }
        const matches = [];
        Object.values(App.pointsMap).forEach(p => {
          if (p.name.toLowerCase().includes(kw.toLowerCase())) matches.push(p);
        });
        if (matches.length === 0) {
          resultsDiv.innerHTML = '<div class="mm-link-noresult">未找到匹配知识点</div>';
        } else {
          resultsDiv.innerHTML = matches.slice(0, 15).map(p =>
            `<div class="mm-link-result-item" data-point="${p.id}">${p.name}</div>`
          ).join('');
        }
      }, 150);
    });

    // 点击结果
    resultsDiv.addEventListener('click', (e) => {
      const item = e.target.closest('.mm-link-result-item');
      if (item) {
        node.pointId = item.dataset.point;
        this.save();
        this.renderAll();
        this.closeLinkPanel();
        App.updateStatus(`已关联知识点：${App.pointsMap[item.dataset.point]?.name}`);
      }
    });

    // 取消关联
    panel.querySelector('.mm-link-remove')?.addEventListener('click', () => {
      node.pointId = null;
      this.save();
      this.renderAll();
      this.closeLinkPanel();
      App.updateStatus('已取消关联');
    });

    // 点击面板外部关闭
    setTimeout(() => {
      const close = (ev) => { if (!panel.contains(ev.target)) { this.closeLinkPanel(); document.removeEventListener('click', close); } };
      document.addEventListener('click', close);
    }, 0);

    input.focus();
  },

  closeLinkPanel() {
    document.querySelector('.mm-link-panel')?.remove();
  },

  /** 从导图节点跳转到知识点详情 */
  jumpToPoint(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || !node.pointId) return;
    const point = App.pointsMap[node.pointId];
    if (!point) return;

    // 切换到知识点浏览 Tab
    App.switchTab('browse');
    // 选中并定位到该知识点
    setTimeout(() => {
      App.selectPoint(node.pointId);
      // 确保在树中可见
      const treeEl = document.getElementById(`tree-point-${node.pointId}`);
      if (treeEl) treeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  },

  /* ========== 画布事件 ========== */

  /** 更新画布和 SVG 的 transform */
  applyTransform() {
    const canvas = document.getElementById('mindmap-canvas');
    const svg = document.getElementById('mindmap-svg');
    const t = `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px)) scale(${this.scale})`;
    if (canvas) canvas.style.transform = t;
    if (svg) svg.style.transform = t;
  },

  bindCanvasEvents() {
    const wrapper = document.querySelector('.mindmap-canvas-wrapper');
    if (!wrapper) return;

    // 空白区域 mousedown → 开始平移画布
    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // 只响应 wrapper 或 svg 上的点击（排除节点）
      if (e.target.closest('.mm-node') || e.target.closest('.mm-node-edit') || e.target.closest('.mm-link-panel')) return;
      this.panning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panFromX = this.panX;
      this.panFromY = this.panY;
      wrapper.style.cursor = 'grabbing';
    });

    // 全局 mousemove → 处理平移
    document.addEventListener('mousemove', (e) => {
      if (!this.panning) return;
      const dx = e.clientX - this.panStartX;
      const dy = e.clientY - this.panStartY;
      this.panX = this.panFromX + dx;
      this.panY = this.panFromY + dy;
      this.applyTransform();
    });

    // 全局 mouseup → 结束平移
    document.addEventListener('mouseup', () => {
      if (this.panning) {
        this.panning = false;
        const wrapper = document.querySelector('.mindmap-canvas-wrapper');
        if (wrapper) wrapper.style.cursor = 'grab';
      }
    });

    // 双击空白区域添加根节点
    wrapper.addEventListener('dblclick', (e) => {
      if (e.target.closest('.mm-node') || e.target.closest('.mm-node-edit')) return;
      if (this.nodes.length >= 200) { alert('节点数已达上限'); return; }
      const rect = wrapper.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxId = Math.max(...this.nodes.map(n => parseInt(n.id)), 0);
      this.nodes.push({
        id: String(maxId + 1),
        text: '新主题',
        x: (e.clientX - cx - this.panX) / this.scale,
        y: (e.clientY - cy - this.panY) / this.scale,
        parent: null,
        pointId: null
      });
      this.save();
      this.renderAll();
    });

    // 滚轮缩放
    wrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.scale = Math.max(0.2, Math.min(2, this.scale - e.deltaY * 0.001));
      this.applyTransform();
    }, { passive: false });

    // 右键画布空白 = 添加根节点
    wrapper.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.mm-node') || e.target.closest('.mm-node-edit')) return;
      e.preventDefault();
      if (this.nodes.length >= 200) return;
      const rect = wrapper.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxId = Math.max(...this.nodes.map(n => parseInt(n.id)), 0);
      this.nodes.push({
        id: String(maxId + 1),
        text: '新主题',
        x: (e.clientX - cx - this.panX) / this.scale,
        y: (e.clientY - cy - this.panY) / this.scale,
        parent: null,
        pointId: null
      });
      this.save();
      this.renderAll();
    });
  },

  /* ========== 工具栏 ========== */

  bindToolbar() {
    document.getElementById('mm-add-root')?.addEventListener('click', () => {
      if (this.nodes.length >= 200) { alert('节点数已达上限'); return; }
      const maxId = Math.max(...this.nodes.map(n => parseInt(n.id)), 0);
      this.nodes.push({
        id: String(maxId + 1),
        text: '新主题',
        x: 0, y: this.nodes.length === 0 ? 70 : 300,
        parent: null,
        pointId: null
      });
      this.save();
      this.renderAll();
    });

    document.getElementById('mm-reset-view')?.addEventListener('click', () => {
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
    });
  },

  /* ========== 绑定科目切换 ========== */

  bindSubjectTabs() {
    document.querySelectorAll('.mindmap-subj-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mindmap-subj-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSubject = btn.dataset.subj;
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.loadSubject(this.currentSubject);
        this.applyTransform();
      });
    });
  },

  /** HTML 转义 */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
