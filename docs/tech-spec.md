# 408 考研复习助手 — 技术规格说明

## 技术栈

- **HTML5**：页面结构
- **CSS3**：样式与布局（CSS Grid + Flexbox，CSS 变量管理主题色）
- **Vanilla JavaScript (ES6+)**：业务逻辑，无框架依赖
- **localStorage**：数据持久化
- **Chart.js**（CDN 引入）：统计图表（可选，也可用纯 CSS 实现简单图表）

## 浏览器兼容

- Chrome 90+
- Safari 15+
- Edge 90+
- Firefox 90+

## 项目文件结构

```
408 Review Assistant/
├── index.html              # 应用入口
├── css/
│   └── style.css           # 全局样式
├── js/
│   ├── app.js              # 主控制器：页面路由、视图渲染、事件绑定
│   ├── data.js             # 预置 408 考纲知识点数据（静态数据）
│   ├── sm2.js              # SM-2 间隔重复算法实现
│   └── storage.js          # localStorage 读写封装
├── docs/                   # 项目文档
│   ├── requirements.md     # 需求规格说明
│   ├── tech-spec.md        # 本文件，技术规格说明
│   ├── design-spec.md      # 设计规范
│   └── development-plan.md # 开发执行计划
├── devlog/                 # 开发日志
├── CLAUDE.md               # AI 助手指引
└── README.md               # 用户使用说明
```

## 数据模型

### 知识点 (KnowledgePoint)

```js
{
  id: "ds-01-01-001",          // 唯一标识：科目缩写-章-节-序号
  name: "数据结构的定义",        // 知识点名称
  description: "",              // 详细内容（用户可编辑，初始为空）
  mastery: 1,                   // 掌握程度：1=完全不会 2=有点印象 3=基本掌握 4=完全掌握
  sm2: {                        // SM-2 算法状态
    interval: 1,                // 当前间隔（天）
    repetitions: 0,             // 连续正确次数
    easeFactor: 2.5,            // 难度系数（SM-2 默认 2.5）
    nextReview: null,           // 下次复习日期 ISO 字符串，null 表示从未复习
    lastReview: null            // 上次复习日期
  },
  reviewHistory: []             // 复习记录 [{date, rating}]
}
```

### 科目 (Subject) / 章 (Chapter) / 节 (Section)

```js
{
  id: "ds",                     // 唯一标识
  name: "数据结构",              // 名称
  chapters: [...]               // 子级数组
}
```

## localStorage 键名规范

| 键名 | 内容 |
|------|------|
| `kr_user_data` | 用户数据：知识点掌握状态、SM-2 状态、复习历史 |
| `kr_settings` | 用户设置（后续扩展：主题、提醒等） |

数据以 JSON 格式存储。首次加载时，将预置考纲与用户数据合并。

## SM-2 算法核心逻辑

```
输入：知识点当前 SM-2 状态、用户自评评分 q（1-4）
输出：更新后的 SM-2 状态

步骤：
1. 将用户评分映射为 SM-2 质量分：
   q=1(完全不会) → 0
   q=2(有点印象) → 2  
   q=3(基本掌握) → 4
   q=4(完全掌握) → 5

2. 如果 q < 3（即自评 ≤ 有点印象）：
   - repetitions 重置为 0
   - interval 重置为 1
2. 如果 q ≥ 3：
   - repetitions += 1
   - 如果 repetitions == 1: interval = 1
   - 如果 repetitions == 2: interval = 3
   - 否则: interval = interval * easeFactor（向上取整）
   
3. 更新 easeFactor：
   EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
   EF' 下限为 1.3

4. nextReview = lastReview + interval 天
```
