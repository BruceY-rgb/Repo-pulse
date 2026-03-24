# Repo-Pulse 前端样式约束文档

> 本文档是 Repo-Pulse 项目所有前端开发的强制性规范。任何前端代码提交前必须符合以下全部规则，无例外。

---

## 1. 总则

**1.1** 本项目仅支持暗黑主题（GitHub Dark 风格 + 橙色强调色），不提供亮色模式。所有设计和实现均以深色背景为基础。

**1.2** 样式实现只允许使用 Tailwind CSS 工具类和已定义的 CSS 变量。禁止编写自定义原生 CSS（已在 `index.css` 中定义的除外）。

**1.3** 组件开发优先使用 shadcn/ui（New York 风格）。只有当 shadcn/ui 无法满足需求时，才允许创建自定义组件，且自定义组件必须遵循 shadcn/ui 的设计语言。

**1.4** 所有用户可见的文案必须通过 i18n 系统管理，中文为默认语言。禁止在组件中硬编码任何中文或英文文案。

**1.5** 代码必须使用 TypeScript strict 模式，禁止使用 `any` 类型。所有组件必须为函数式组件 + hooks，禁止使用 class 组件。

---

## 2. 颜色系统

**2.1** 所有颜色必须通过 CSS 变量引用。在 Tailwind 中使用语义化颜色类（如 `bg-background`、`text-foreground`、`border-border`），禁止硬编码任何颜色值（如 `bg-[#0d1117]`）。

**2.2** 语义化颜色变量对照表：

| 用途 | CSS 变量 | Tailwind 类 |
|------|----------|-------------|
| 页面背景 | `--background` | `bg-background` |
| 主文字 | `--foreground` | `text-foreground` |
| 卡片背景 | `--card` | `bg-card` |
| 主色/强调色 | `--primary` | `bg-primary`, `text-primary` |
| 次要背景 | `--secondary` | `bg-secondary` |
| 灰色/禁用 | `--muted` | `bg-muted`, `text-muted-foreground` |
| 边框 | `--border` | `border-border` |
| 输入框 | `--input` | `bg-input` |
| 焦点环 | `--ring` | `ring-ring` |
| 危险/错误 | `--destructive` | `bg-destructive`, `text-destructive` |

**2.3** 状态颜色使用 `--github-*` 系列变量：

| 状态 | 变量 | 色值 | 用法示例 |
|------|------|------|----------|
| 成功 | `--github-success` | `#238636` | `text-[var(--github-success)]` |
| 警告 | `--github-warning` | `#f0883e` | `text-[var(--github-warning)]` |
| 危险 | `--github-danger` | `#da3633` | `text-[var(--github-danger)]` |
| 信息 | `--github-info` | `#58a6ff` | `text-[var(--github-info)]` |

**2.4** 状态徽章必须使用已定义的 CSS 类：`badge-success`、`badge-warning`、`badge-danger`、`badge-info`。这些类使用半透明背景色，在暗黑主题下表现良好。

**2.5** 主色/强调色为橙色（`--primary: 16 100% 50%`，即 `#ff4d00`）。所有需要强调的交互元素（按钮、链接高亮、选中状态）统一使用 `primary` 色。

**2.6** 渐变文字效果使用 `.gradient-text` 类（从 `#ff4d00` 到 `#ff8c00`）。禁止自定义其他渐变。

**2.7** 发光效果使用 `.glow-orange` 类。禁止自定义 `box-shadow` 颜色值。

**2.8** 透明度叠加色只允许使用 `white/5`、`white/10`、`white/20` 等 Tailwind 透明度语法，用于 hover 效果和半透明覆盖层。禁止使用 `rgba()` 硬编码（已在 index.css 中定义的除外）。

---

## 3. 排版

**3.1** 正文字体为 Inter，通过 Google Fonts 加载。字体栈为：`'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`。禁止使用其他正文字体。

**3.2** 代码/等宽字体栈为：`'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace`。代码块使用 `.code-block` 类。

**3.3** 字号层级严格按照以下规范使用：

| 用途 | Tailwind 类 | 实际大小 |
|------|-------------|----------|
| 辅助文字/标签 | `text-xs` | 12px |
| 正文/描述 | `text-sm` | 14px |
| 常规正文 | `text-base` | 16px |
| 小标题 | `text-lg` | 18px |
| 二级标题 | `text-xl` | 20px |
| 一级标题 | `text-2xl` | 24px |
| 页面标题 | `text-3xl` | 30px |
| 大标题/Hero | `text-4xl` | 36px |

**3.4** 标题（h1-h3）使用 `font-bold` 或 `font-semibold`。正文和描述使用默认字重（400）。辅助文字可使用 `font-medium`（500）。禁止使用 `font-thin`、`font-light`（300以下）。

**3.5** 描述性文字和次要信息使用 `text-muted-foreground` 颜色。禁止使用 `text-gray-*` 等 Tailwind 默认灰色类。

**3.6** 行高使用 Tailwind 默认值，不额外指定。标题可使用 `tracking-tight` 收紧字间距。正文描述可使用 `leading-relaxed` 放松行高。

---

## 4. 间距

**4.1** 所有间距遵循 Tailwind 的 4px 倍数体系。常用间距值：

| 值 | 像素 | 用途 |
|----|------|------|
| `1` | 4px | 极小间距（图标与文字） |
| `2` | 8px | 紧凑间距（Badge 内边距） |
| `3` | 12px | 小间距（列表项内边距） |
| `4` | 16px | 标准间距（卡片内边距） |
| `6` | 24px | 中等间距（区块间距） |
| `8` | 32px | 大间距（页面级区块间距） |

**4.2** 页面级区块间距统一使用 `space-y-6`（24px）或 `space-y-8`（32px）。禁止使用超过 `space-y-12` 的间距。

**4.3** 卡片内部使用 `CardHeader`（自带内边距）和 `CardContent`（自带内边距）组件。禁止在 Card 组件上额外添加 padding。

**4.4** 网格系统列间距统一使用 `gap-4`（16px）或 `gap-6`（24px）。禁止使用 `gap-1`、`gap-2` 作为网格间距（太紧凑）。

**4.5** 图标与文字间距使用 `gap-2`（8px）或 `gap-3`（12px），通过 `flex items-center gap-2` 布局。禁止使用 margin 调整图标与文字间距。

**4.6** 表单元素垂直间距统一使用 `space-y-4`。表单标签与输入框间距使用 `space-y-2`。

---

## 5. 圆角

**5.1** 圆角使用 CSS 变量 `--radius`（基础值 0.75rem = 12px），通过 Tailwind 扩展类使用：

| Tailwind 类 | 计算值 | 用途 |
|-------------|--------|------|
| `rounded-xl` | `calc(var(--radius) + 4px)` = 16px | 卡片、模态框 |
| `rounded-lg` | `var(--radius)` = 12px | 按钮、输入框 |
| `rounded-md` | `calc(var(--radius) - 2px)` = 10px | 小型容器 |
| `rounded-sm` | `calc(var(--radius) - 4px)` = 8px | 标签、小元素 |
| `rounded-full` | 50% | Badge、头像、圆形按钮 |

**5.2** Card 组件统一使用 `rounded-xl`。这已在 `.card-github` 类中定义，shadcn/ui Card 自动应用。

**5.3** 按钮圆角：常规按钮 `rounded-lg`，X 风格按钮使用 `.btn-x`（`rounded-full`）。

**5.4** Badge 统一使用 `rounded-full`。代码块使用 `rounded-lg`。输入框使用 `rounded-lg`。

---

## 6. 组件使用规范

**6.1** Card 组件必须使用 `CardHeader` + `CardContent` 的标准结构。需要标题时使用 `CardTitle`，需要描述时使用 `CardDescription`。

```tsx
// 正确
<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
  </CardHeader>
  <CardContent>
    内容
  </CardContent>
</Card>

// 错误 - 不使用 CardHeader/CardContent
<Card>
  <div className="p-4">
    <h3>标题</h3>
    <p>内容</p>
  </div>
</Card>
```

**6.2** Badge 用于状态标识和标签。使用 shadcn/ui 的 `Badge` 组件，variant 选择：`default`（主色）、`secondary`（灰色）、`outline`（边框）、`destructive`（危险）。

**6.3** Button 使用 shadcn/ui 的 `Button` 组件。常用 variant：`default`（主色填充）、`secondary`、`outline`、`ghost`、`destructive`。尺寸：`default`、`sm`、`lg`、`icon`。

**6.4** Dialog（对话框）使用 shadcn/ui 的 `Dialog` 组件族（`DialogTrigger`、`DialogContent`、`DialogHeader`、`DialogTitle`、`DialogDescription`、`DialogFooter`）。禁止自行实现模态框。

**6.5** 下拉菜单使用 `DropdownMenu` 组件族。Select 使用 `Select` 组件族。禁止使用原生 `<select>`。

**6.6** 表格使用 shadcn/ui 的 `Table` 组件族（`Table`、`TableHeader`、`TableBody`、`TableRow`、`TableHead`、`TableCell`）。禁止使用原生 `<table>` 标签。

**6.7** 数据加载状态使用 `Skeleton` 组件。错误状态应显示在 Card 内，带有错误图标和重试按钮。空状态应有插图和引导文案。

**6.8** Toast 通知使用 shadcn/ui 的 `toast`（来自 `@/hooks/use-toast`）。禁止使用 `alert()` 或自行实现通知弹窗。

**6.9** Tooltip 使用 shadcn/ui 的 `Tooltip` 组件族。所有图标按钮都应附带 Tooltip 说明。

---

## 7. 自定义 CSS 类

**7.1** 以下自定义 CSS 类已在 `index.css` 中定义，应在适当场景使用：

| 类名 | 用途 | 使用场景 |
|------|------|----------|
| `.card-github` | GitHub 风格卡片 | 需要额外卡片样式时 |
| `.btn-x-primary` | 主色圆角按钮 | 突出的 CTA 按钮 |
| `.btn-x-secondary` | 次要圆角按钮 | 辅助操作按钮 |
| `.hover-x` | X 风格 hover 效果 | 列表项、可点击区域 |
| `.code-block` | 代码块样式 | 展示代码片段 |
| `.glass` | 毛玻璃效果 | 浮层、特殊卡片 |
| `.gradient-text` | 渐变文字 | 标题强调 |
| `.glow-orange` | 橙色发光 | 特殊高亮元素 |
| `.scrollbar-github` | 自定义滚动条 | 滚动容器 |

**7.2** 使用自定义类时，优先使用 Tailwind 工具类。只有当 Tailwind 无法直接实现效果时，才使用自定义 CSS 类。

**7.3** 禁止在 `index.css` 之外的文件中添加新的全局 CSS 类。如需新的可复用样式，应讨论后统一添加到 `index.css`。

**7.4** 状态徽章 `.badge-success/warning/danger/info` 用于需要自定义样式的状态标识。常规场景优先使用 shadcn/ui Badge。

**7.5** 动画类 `.animate-pulse-slow` 和 `.animate-float` 仅用于装饰性动画（如 Landing 页面）。功能性界面中禁止使用。

---

## 8. 图标

**8.1** 图标库统一使用 `lucide-react`。禁止引入其他图标库（如 react-icons, heroicons, Font Awesome 等）。

**8.2** 图标尺寸规范：

| 尺寸类 | 用途 |
|--------|------|
| `h-3 w-3` | 极小场景（Badge 内） |
| `h-4 w-4` | 行内图标、按钮内图标、列表项图标 |
| `h-5 w-5` | 标题前图标、导航图标、中等尺寸场景 |
| `h-6 w-6` | 大型导航图标 |
| `h-8 w-8` | 功能卡片图标、空状态图标 |

**8.3** 图标颜色跟随文字颜色（`text-foreground`、`text-muted-foreground`）或使用语义色（`text-primary`、`text-[var(--github-success)]` 等）。禁止给图标硬编码颜色。

**8.4** 图标与文字组合使用 `flex items-center gap-2` 布局。禁止使用 margin 调整位置。

**8.5** 图标按钮使用 `Button` 的 `size="icon"` variant，并附带 `Tooltip` 说明文字。

---

## 9. 动画与过渡

**9.1** 微交互（hover、focus、状态切换）使用 Tailwind 过渡类：`transition-all duration-200 ease-out`。或使用已定义的 `.hover-x` 类。

**9.2** 复杂动画（入场动画、序列动画、滚动驱动动画）使用 GSAP 库。禁止使用 CSS `@keyframes` 自定义新动画（`index.css` 中已有的除外）。

**9.3** shadcn/ui 组件自带的动画（Accordion、Dialog 弹入弹出等）保持原样，不覆盖。

**9.4** 所有动画必须尊重 `prefers-reduced-motion` 偏好。GSAP 动画需检查：
```tsx
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced) {
  gsap.to(/* ... */);
}
```

**9.5** 禁止使用超过 500ms 的过渡时长（装饰性动画除外）。功能性过渡（如 Tab 切换、下拉菜单展开）限制在 200ms 以内。

**9.6** 装饰性动画仅用于 Landing 页面和空状态。功能性页面（仪表板、列表、表单）禁止添加入场动画。

**9.7** 加载状态使用 `Skeleton` 组件或 `animate-pulse`，禁止使用旋转 spinner。

---

## 10. 布局

**10.1** 应用整体布局：侧边栏（固定宽度 264px，可折叠）+ 顶部 Header（sticky，高度 64px）+ 内容区域。

**10.2** 内容区域无最大宽度限制。使用 `p-6` 或 `p-8` 作为内容区域内边距。

**10.3** 响应式网格使用以下模式：
```
grid grid-cols-1 md:grid-cols-2 gap-4          // 两列
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4  // 三列
grid grid-cols-1 md:grid-cols-3 gap-4          // 三等分
```

**10.4** 页面内容纵向间距使用 `space-y-6` 或 `space-y-8`。每个页面的顶部必须有标题区域（h1 + 描述文字）。

**10.5** 侧边栏导航使用已定义的 `Sidebar` 组件结构。导航项使用 `hover-x` 类实现 hover 效果。当前激活项使用 `bg-primary/10 text-primary` 样式。

**10.6** 移动端适配：侧边栏在小屏幕（`< md`）时收起为汉堡菜单。内容区域在小屏幕时使用单列布局。

---

## 11. 表单

**11.1** 表单组件使用 shadcn/ui 的 `Input`、`Textarea`、`Select`、`Checkbox`、`RadioGroup`、`Switch`。禁止使用原生 HTML 表单元素。

**11.2** 表单标签使用 shadcn/ui 的 `Label` 组件，放置在输入框上方，间距 `space-y-2`。

**11.3** 表单验证使用 `zod` schema + `react-hook-form`。错误消息显示在输入框下方，使用 `text-sm text-destructive`。

**11.4** 必填字段在 Label 后标注 `*`，使用 `text-destructive`。

**11.5** 表单提交按钮放置在右侧（`flex justify-end`），使用 `Button` 的 `default` variant。取消按钮使用 `outline` variant。

**11.6** 表单整体纵向间距使用 `space-y-4`，表单分组使用 `space-y-6`。

---

## 12. 图表

**12.1** 图表库统一使用 Recharts。禁止引入其他图表库（如 ECharts, Chart.js, D3 直接使用等）。

**12.2** 图表颜色必须使用项目定义的颜色变量：
- 主系列：`var(--github-accent)` (#ff4d00)
- 次系列：`var(--github-info)` (#58a6ff)
- 第三系列：`var(--github-success)` (#238636)
- 第四系列：`var(--github-warning)` (#f0883e)
- 背景网格线：`var(--github-border)` (#30363d)
- 文字标签：`var(--github-text-secondary)` (#8b949e)

**12.3** 图表容器使用 `ResponsiveContainer` 组件包裹，宽度 100%，高度固定（推荐 300px 或 400px）。

**12.4** 图表放在 Card 组件内，使用 `CardHeader` 放置标题，`CardContent` 放置图表。

**12.5** Tooltip 样式需自定义匹配暗黑主题：背景色 `var(--github-surface)`，边框 `var(--github-border)`，文字 `var(--github-text)`。

---

## 13. 国际化

**13.1** 所有用户可见的文案必须通过 i18n 系统管理。使用 `useLanguage()` hook 获取 `t()` 翻译函数和当前语言。

**13.2** 中文为默认语言和主要开发语言。翻译文件结构为 `src/locales/zh.json` 和 `src/locales/en.json`。

**13.3** 翻译键命名规范：`模块.页面.元素`，使用点分隔。例如：
```
dashboard.metrics.totalEvents
notification.settings.channel
approval.actions.approve
```

**13.4** 禁止在组件中使用三元表达式切换语言（如 `isZh ? '中文' : 'English'`）。所有文案必须通过 `t()` 函数获取。

**13.5** 日期和数字格式化根据当前语言自动适配。日期使用 `date-fns` 配合 locale。

---

## 14. 暗黑主题

**14.1** 本项目仅支持暗黑主题，不实现亮色模式切换。Tailwind 配置中 `darkMode: "class"` 仅用于 shadcn/ui 组件兼容，不用于主题切换。

**14.2** 禁止使用 `dark:` 前缀的 Tailwind 类。所有样式默认即为暗黑主题样式。

**14.3** 背景色层级规范：
- 页面背景：`bg-background`（最深，`#0d1117`）
- 卡片/面板：`bg-card`（稍浅，`#161b22`）
- 输入框/次要区域：`bg-muted`（更浅，对应 secondary）
- Hover 状态：`hover:bg-white/5`

**14.4** 文字颜色层级规范：
- 主文字：`text-foreground`（`#c9d1d9`）
- 次要文字/描述：`text-muted-foreground`（`#8b949e`）
- 禁用文字：`text-muted-foreground/50`
- 强调文字：`text-primary`（`#ff4d00`）

---

## 15. 禁止事项

**15.1** **禁止使用内联 style**。所有样式必须通过 Tailwind 类或已定义的 CSS 类实现。

**15.2** **禁止使用 `!important`**。如遇样式冲突，通过调整 Tailwind 类的顺序和特异性解决。

**15.3** **禁止引入外部 CSS 框架**。禁止使用 Bootstrap、Ant Design、Material UI、Chakra UI 等。组件库仅使用 shadcn/ui。

**15.4** **禁止引入外部图标库**。仅使用 lucide-react。

**15.5** **禁止硬编码颜色值**。所有颜色必须通过 CSS 变量或 Tailwind 语义色类使用。

**15.6** **禁止硬编码文案**。所有用户可见的文字必须通过 i18n 系统管理。

**15.7** **禁止使用 class 组件**。所有组件必须为函数式组件。

**15.8** **禁止使用 `any` 类型**。TypeScript 严格模式下，必须为所有变量和参数提供明确的类型定义。

**15.9** **禁止使用原生 HTML 表单元素**。`<input>`、`<select>`、`<textarea>` 必须替换为 shadcn/ui 对应组件。

**15.10** **禁止在组件文件中定义全局 CSS**。新的全局样式只能添加到 `index.css`，且需经过审核。

**15.11** **禁止使用 `px` 单位指定间距**。必须使用 Tailwind 的间距类（如 `p-4`、`m-2`、`gap-3`）。

**15.12** **禁止使用 `dark:` Tailwind 前缀**。项目仅有暗黑主题，所有样式直接编写。

---

## 附录：快速参考

### 颜色速查

```
背景:     bg-background          (#0d1117)
卡片:     bg-card                (#161b22)
边框:     border-border          (#30363d)
主色:     text-primary / bg-primary  (#ff4d00)
文字:     text-foreground        (#c9d1d9)
次要文字: text-muted-foreground  (#8b949e)
成功:     var(--github-success)  (#238636)
警告:     var(--github-warning)  (#f0883e)
危险:     var(--github-danger)   (#da3633)
信息:     var(--github-info)     (#58a6ff)
```

### 间距速查

```
紧凑:   gap-2 / space-y-2   (8px)
标准:   gap-3 / space-y-3   (12px)
宽松:   gap-4 / space-y-4   (16px)
区块:   gap-6 / space-y-6   (24px)
页面:   space-y-8           (32px)
```

### 圆角速查

```
卡片:   rounded-xl  (16px)
按钮:   rounded-lg  (12px)
输入框: rounded-lg  (12px)
Badge:  rounded-full
代码块: rounded-lg  (12px)
```
