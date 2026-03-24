// 主题配置，定义颜色系统(CSS变量)、动画、圆角

/** @type {import('tailwindcss').Config} 
 * 这是TypeScript类型提示，告诉编辑器这个配置对象符合TailwindCSS的Config类型规范
 * 即使不用TypeScript，这个注释也能提供更好的代码提示
*/
module.exports = {
  darkMode: ["class"], //基于CSS类名切换
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'], // 指定Tailwind要扫描的文件路径
  // ** 表示任意层级子目录，*表示任意文件名
  theme: { 
    extend: { // 自定义颜色系统
      colors: { // 扩展自定义颜色变量，实现全局颜色统一管理
        // colors:基础颜色(用于布局、边框、输入框等)
        // css的hsl颜色函数, 读取CSS变量 --xxx的值作为颜色参数
        // 我们需要在全局CSS中先定义这些--xxx变量，否则颜色不会生效
        border: "hsl(var(--border))", // 边框颜色
        input: "hsl(var(--input))", // 输入框背景/边框颜色
        ring: "hsl(var(--ring))", // 焦点环(输入框：focus)颜色
        background: "hsl(var(--background))", // 页面背景颜色
        foreground: "hsl(var(--foreground))", // 页面文字颜色
        // 主色调：品牌色，支持多级属性
        primary: {
          DEFAULT: "hsl(var(--primary))", // 默认值
          foreground: "hsl(var(--primary-foreground))", // 主色背景上的文字色
        },
        // 次要色调：辅助操作、次要按钮等
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        // 危险/错误色调(删除、取消、报错等等)
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)", // 后面是透明度
          // <alpha-value>是Tailwind文档的「占位符」，实际使用时替换为具体的透明度或删除
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        // 弱化色调（次要文字、占位符、分割线等等）
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // 强调色调（高亮标签徽章等）
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        // 弹出层色调(如弹唱、下拉菜单等)
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // 侧边栏专用色调(后台、仪表盘项目)
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // 自定义圆角 --radius
      // calc():CSS计算函数，用于动态计算圆角尺寸
      borderRadius: { // 扩展自定义圆角尺寸
        xl: "calc(var(--radius) + 4px)", // 超大
        lg: "var(--radius)", // 大圆角(默认值)
        md: "calc(var(--radius) - 2px)", // 中圆角
        sm: "calc(var(--radius) - 4px)", // 小圆角
        xs: "calc(var(--radius) - 6px)", // 超小
      },
      // 自定义阴影
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)", // 超小阴影，rgb(0 0 0 / 0.05)表示黑色+5%透明度
      },
      // 动画关键帧
      // 每个keyframe对应一个动画的状态变化规则
      keyframes: { // 定义动画的关键帧(动画的起始/中间/结束状态)
        // 手风琴展开动画(从高度0到目标高度)
        "accordion-down": {
          from: { height: "0" }, // 动画起始状态：高度0
          to: { height: "var(--radix-accordion-content-height)" }, // 动画结束状态：高度为radix-accordion-content-height
        },
        // 手风琴收起动画(从目标高度到高度0)
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // 光标闪烁动画(模拟输入框光标闪烁)
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },// 0%/70%/100% 时刻：不透明
          "20%,50%": { opacity: "0" },// 20%/50% 时刻：透明
        },
      },
      // 绑定动画关键帧到类名
      // - ease-out:缓动函数(动画结束时减速)
      // - infinite:无限循环(光标闪烁需要)
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  // 引入Tailwind插件，扩展更多功能
  plugins: [require("tailwindcss-animate")], // tailwindcss-animate插件(提供预设动画、过渡效果)
}