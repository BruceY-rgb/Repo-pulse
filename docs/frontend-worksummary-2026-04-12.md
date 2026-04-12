# Repo-Pulse 前端工作总结（2026-04-12）

## 1. 今日修复目标

今日完成 3 个高优先级稳定性问题修复，目标是避免页面白屏、动画报错和实时连接异常断开：

1. 修复通知相关页面的 `Cannot read properties of undefined (reading 'includes')`。
2. 修复 GSAP `Invalid property scrollTrigger`。
3. 修复 WebSocket 连接在开发环境下看起来“提前关闭”的生命周期问题。

---

## 2. Bug 1：通知页/设置页 undefined includes 崩溃

### 2.1 触发时机

当通知偏好接口返回数据不完整（例如缺少 `channels` 或 `events`）时，页面渲染阶段执行 `.includes()` 或深层属性访问会直接抛错，导致白屏。

常见触发路径：

1. 打开通知页后渲染渠道开关。
2. 打开设置页的通知配置 Tab。

### 2.2 修复改动

核心策略：统一初始状态 + 可选链兜底 + 保存前归一化。

1. `Notifications.tsx` 增加默认事件对象，并将 `channels/events` 做运行时兜底。
2. 所有渠道开关判断改为 `prefs?.channels?.includes(...) ?? false`。
3. 所有事件布尔读取改为 `prefs?.events?.xxx ?? false`。
4. `toggleChannel/toggleEvent/saveContactSettings` 提交时附带归一化后的 `channels/events`，避免后续写回脏结构。

### 2.3 变更文件与关键位置

1. [apps/web/src/pages/Notifications.tsx](apps/web/src/pages/Notifications.tsx#L50)
2. [apps/web/src/pages/Notifications.tsx](apps/web/src/pages/Notifications.tsx#L122)
3. [apps/web/src/pages/Notifications.tsx](apps/web/src/pages/Notifications.tsx#L403)
4. [apps/web/src/pages/Notifications.tsx](apps/web/src/pages/Notifications.tsx#L439)

5. `Settings.tsx` 新增 `defaultNotificationPreferences`。
6. 加载通知偏好后进行 merge 归一化，确保 `channels/events` 不为 `undefined`。
7. 所有 `channels.includes` 和 `events.xxx` 读取补齐 `?.` 与默认值。

8. [apps/web/src/pages/Settings.tsx](apps/web/src/pages/Settings.tsx#L40)
9. [apps/web/src/pages/Settings.tsx](apps/web/src/pages/Settings.tsx#L100)
10. [apps/web/src/pages/Settings.tsx](apps/web/src/pages/Settings.tsx#L314)
11. [apps/web/src/pages/Settings.tsx](apps/web/src/pages/Settings.tsx#L402)

---

## 3. Bug 2：GSAP ScrollTrigger 未注册

### 3.1 触发时机

Landing 页面在 `useEffect` 中调用 `gsap.fromTo` 并配置 `scrollTrigger` 时，如果插件未注册，会报：

`Invalid property scrollTrigger`

### 3.2 修复改动

将 `ScrollTrigger` 在应用入口统一注册，确保任意组件使用 `scrollTrigger` 前已完成插件注入。

### 3.3 变更文件与关键位置

1. [apps/web/src/main.tsx](apps/web/src/main.tsx#L3)
2. [apps/web/src/main.tsx](apps/web/src/main.tsx#L4)
3. [apps/web/src/main.tsx](apps/web/src/main.tsx#L10)

---

## 4. Bug 3：WebSocket 生命周期提前关闭

### 4.1 触发时机

在开发环境启用 React StrictMode 时，组件会发生一次“挂载 -> 卸载 -> 再挂载”的检查流程。旧逻辑在 cleanup 里立即 `disconnect`，会出现连接刚建立就被断开的现象。

### 4.2 修复改动

核心策略：避免瞬时卸载误断开，并确保重连后房间订阅正确恢复。

1. 增加 `disconnectTimerRef`，将断开改为短延迟执行。
2. 在重新挂载的 `connect` 中清理待执行断开定时器，避免误杀连接。
3. 新增 `syncRoomSubscriptions`，并在 socket `connect` 事件触发后同步 join/leave。
4. 仓库订阅变化统一走同步函数，减少时机竞态和漏订阅。

### 4.3 变更文件与关键位置

1. [apps/web/src/hooks/use-web-socket.ts](apps/web/src/hooks/use-web-socket.ts#L20)
2. [apps/web/src/hooks/use-web-socket.ts](apps/web/src/hooks/use-web-socket.ts#L32)
3. [apps/web/src/hooks/use-web-socket.ts](apps/web/src/hooks/use-web-socket.ts#L96)
4. [apps/web/src/hooks/use-web-socket.ts](apps/web/src/hooks/use-web-socket.ts#L109)
5. [apps/web/src/hooks/use-web-socket.ts](apps/web/src/hooks/use-web-socket.ts#L127)

---

## 5. 今日结果

1. 通知/设置页的 undefined 访问链已做防御，白屏风险显著降低。
2. Landing 页 `scrollTrigger` 报错已通过入口注册修复。
3. WebSocket 在开发模式下的“提前关闭”现象已通过生命周期防抖与重连订阅同步处理。
