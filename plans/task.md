# 多 Agent 多 CLI 开发计划

## 1. 开发范围

基于 [`plans/architecture.md`](plans/architecture.md) 的统一 Agent 架构，落地可执行开发任务。

目标
- 本地与远程统一走 Agent
- 会话强绑定 `instanceId`
- 中心服务支持多实例与多 CLI provider 路由
- 首版 provider 为 OpenCode，预留 Qwen CLI 接口
- 不考虑旧版兼容，按新项目目标直接落地

## 规则补充

- [x] 每次任务完成后，必须更新 `plans/task.md` 的对应勾选状态与进度说明

## 2. 里程碑

### M1 契约与数据基础
- [x] 在 `shared` 增加实例与 provider 契约类型
- [x] 在 `backend` 新增 instances 相关 migration
- [x] 为会话模型增加 `instance_id` 字段
- [x] 增加基础查询与索引

验收
- [x] 数据库可完成迁移
- [x] 会话与实例归属字段完整可用

### M2 中心服务接入与鉴权
- [x] 新增实例注册接口
- [x] 新增心跳续租接口
- [x] 新增实例 token 鉴权中间件
- [x] 支持 token 轮换与吊销

验收
- [x] 未鉴权实例不可注册或调用
- [x] 已吊销 token 立即失效

### M3 实例路由与会话隔离
- [x] 增加按 `instanceId` 的代理路由层
- [x] 将 `/api/opencode/*` 升级为实例化路由
- [ ] 所有会话接口强制绑定 `instanceId`
- [x] 缺少 `instanceId` 时统一拒绝

验收
- [ ] 不同实例会话互不可见
- [ ] 跨实例请求被拒绝并记录审计

### M4 Agent 工程骨架
- [ ] 新建 `agent` 工程与配置加载
- [ ] 实现 `connection-client`
- [ ] 实现 `process-manager`
- [ ] 实现 `http-bridge`
- [ ] 实现 `capability-reporter`

验收
- [ ] Agent 可注册
- [ ] Agent 可心跳
- [ ] Agent 可将请求转发到本机 CLI

### M5 Provider 抽象与 OpenCode 接入
- [ ] 实现 `provider-registry`
- [ ] 定义 provider 统一接口
- [ ] 落地 OpenCode provider
- [ ] 预留 Qwen provider 占位实现

验收
- [ ] OpenCode provider 可运行
- [ ] provider 切换不影响中心路由

### M6 前端改造
- [ ] 增加 Agent 列表页与选择器
- [ ] 会话列表按当前 Agent 加载
- [ ] 新建会话默认绑定当前 Agent
- [ ] 断线离线状态提示

验收
- [ ] 未选 Agent 不可进入会话
- [ ] 切换 Agent 后会话列表即时切换

### M7 测试与文档
- [ ] 增加实例鉴权测试
- [ ] 增加断线重连测试
- [ ] 增加会话隔离测试
- [ ] 增加 provider 能力上报测试
- [ ] 更新部署与运维文档

验收
- [ ] 核心测试通过
- [ ] 文档可指导统一 Agent 架构部署

## 3. 任务分解清单

### Backend
- [x] 实例数据表与查询实现
- [x] 实例注册、心跳、token 管理 API
- [x] `instanceId` 路由中间件
- [x] 实例审计日志
- [ ] 会话表与会话接口改造
- [ ] 移除中心服务对本机 CLI 直连依赖

### Agent
- [ ] 工程初始化与运行配置
- [ ] 长连接与重连策略
- [ ] 本地 CLI 生命周期管理
- [ ] 本地代理桥接
- [ ] provider 注册与能力上报

### Frontend
- [ ] Agent 选择交互
- [ ] 会话按实例过滤
- [ ] 错误与离线态 UX

### Shared
- [x] 实例与 provider 公共类型
- [x] 协议 schema 与校验

## 进度同步（2026-03-03）

- [x] 完成实例相关 migration 与索引（含 `session.instance_id`）
- [x] 完成实例注册、心跳、token 轮换/吊销与鉴权路由
- [x] 完成 `/api/opencode/*` 的 `instanceId` 强制校验与会话级访问控制
- [x] 完成共享实例 schema/types 导出与契约对齐（补齐 `tokenId`）
- [x] 完成 CORS 放行 `x-instance-id`
- [ ] 待完成：所有会话接口全面绑定 `instanceId`，以及中心服务本机 CLI 直连路径移除

## 4. 风险与应对

- 风险：实例切换导致会话串线
  - 应对：后端强制 `instanceId` 校验，不依赖前端兜底

- 风险：Agent 断线影响会话体验
  - 应对：心跳超时降级只读并提示重连

- 风险：多 provider 协议差异大
  - 应对：先固化 provider 接口最小子集，按能力标识渐进扩展

## 5. 完成定义

- [ ] 统一 Agent 路径可在本地和远程节点运行
- [ ] 会话与实例严格隔离
- [ ] OpenCode provider 稳定可用
- [ ] Qwen provider 具备接入接口
- [ ] 中心服务不再包含本机 CLI 直连路径
- [ ] 核心测试与文档齐全
