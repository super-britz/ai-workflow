# Design: <feature name> (Backend)

## 架构定位

<在整体架构中的位置，引用 .claude/ARCHITECTURE.md 的哪些模块>

## API 契约

### <Endpoint 名>

- Method: POST
- Path: /api/v1/...
- Request: <结构>
- Response: <结构>
- Error codes: <列表>

## 数据模型

### <Entity 名>

- 字段 / 类型 / 约束
- 索引策略

## 核心流程

<sequence 描述或伪代码>

## 架构变更

<若无，写"无">
<若有，必须是 .claude/ARCHITECTURE.md 可以吸收的 diff-friendly 格式>

## 安全考虑

<认证、授权、输入校验、敏感数据处理>
<若无额外考虑，写"无">

## 编码约定变更

<若无，写"无">

## 性能与扩展性

- 预期 QPS / 延迟
- 扩展瓶颈点

## 错误处理与降级

- 关键错误路径
- 降级策略
