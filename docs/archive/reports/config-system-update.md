# 配置系统更新说明

## 更新时间
2026-01-23

## 更新内容

### 1. 智能数据库类型默认值

配置系统现在支持根据运行环境自动选择默认的数据库类型：

- **开发环境 (development)**: 默认使用 `sqlite`
- **生产环境 (production)**: 默认使用 `postgres`
- **测试环境 (test)**: 默认使用 `memory`

#### 行为说明

1. **自动选择**：如果未设置 `DATABASE_TYPE` 环境变量，系统会根据 `NODE_ENV` 自动选择合适的数据库类型
2. **手动覆盖**：如果显式设置了 `DATABASE_TYPE`，将使用指定的值而不是默认值
3. **向后兼容**：现有配置文件不受影响，继续使用之前设置的数据库类型

### 2. PostgreSQL 配置变为可选

PostgreSQL 相关的环境变量现在只在 `DATABASE_TYPE=postgres` 时才是必需的：

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_SSL`

#### 验证逻辑

当 `DATABASE_TYPE=postgres` 时，系统会验证以下字段是否已设置：
- POSTGRES_HOST（必需）
- POSTGRES_USER（必需）
- POSTGRES_PASSWORD（必需）
- POSTGRES_DB（必需）

如果缺少任何必需字段，系统会抛出清晰的错误提示，例如：
```
PostgreSQL configuration is required when DATABASE_TYPE='postgres'.
Missing environment variables: POSTGRES_HOST, POSTGRES_USER
```

### 3. 配置日志优化

启动时的日志输出现在会显示实际使用的数据库类型：

```
========================================
Configuration Loaded Successfully
========================================
Environment: development
Worker ID: worker-1
Concurrency: 2
Database Type: sqlite
PostgreSQL: Not configured (using sqlite)
Redis: redis://:****@localhost:6379
LLM: deepseek-chat @ https://api.deepseek.com
Storage: local
========================================
```

如果使用 PostgreSQL，则会显示：
```
Database Type: postgres
PostgreSQL: localhost:5432/content_creator
```

## 使用示例

### 开发环境（推荐使用 SQLite）

```bash
# .env 文件
NODE_ENV=development
# 不设置 DATABASE_TYPE，自动使用 sqlite

# 其他必需配置
REDIS_URL=redis://localhost:6379
LLM_API_KEY=your_key
LLM_BASE_URL=https://api.deepseek.com
TAVILY_API_KEY=your_key
ARK_API_KEY=your_key
```

### 生产环境（推荐使用 PostgreSQL）

```bash
# .env 文件
NODE_ENV=production
# 不设置 DATABASE_TYPE，自动使用 postgres

# PostgreSQL 配置（必需）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=content_creator

# 其他必需配置
REDIS_URL=redis://localhost:6379
LLM_API_KEY=your_key
LLM_BASE_URL=https://api.deepseek.com
TAVILY_API_KEY=your_key
ARK_API_KEY=your_key
```

### 测试环境（自动使用内存数据库）

```bash
# 测试环境下，自动使用 memory 数据库
NODE_ENV=test
# 不需要任何数据库配置
```

### 手动指定数据库类型

```bash
# 即使在开发环境，也可以强制使用 PostgreSQL
NODE_ENV=development
DATABASE_TYPE=postgres

# PostgreSQL 配置（必需）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=content_creator
```

## 迁移指南

### 从旧配置迁移

**之前的配置**（PostgreSQL 总是必需的）：
```bash
# 必须提供 PostgreSQL 配置，即使不使用
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=content_creator
```

**新的配置**（根据需要选择）：
```bash
# 选项 1: 使用 SQLite（推荐用于开发）
NODE_ENV=development
# 无需 PostgreSQL 配置

# 选项 2: 使用 PostgreSQL（推荐用于生产）
NODE_ENV=production
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=content_creator
```

### 现有项目更新步骤

1. **确定你的运行环境**：检查 `NODE_ENV` 的值
2. **选择数据库类型**：
   - 开发环境：建议使用 SQLite（删除或注释掉 `DATABASE_TYPE`）
   - 生产环境：建议使用 PostgreSQL（确保有 PostgreSQL 配置）
3. **更新 .env 文件**：参考上面的示例
4. **验证配置**：启动应用，查看日志输出的 `Database Type`

## 技术细节

### 实现原理

1. **配置类增强** (`src/config/index.ts`)：
   - 添加 `private databaseType` 属性存储实际使用的数据库类型
   - 实现 `getDefaultDatabaseType()` 方法根据环境返回默认值
   - 添加 `validatePostgresConfig()` 方法验证 PostgreSQL 配置

2. **Schema 调整**：
   - `DATABASE_TYPE` 改为可选（`optional()`）
   - 所有 PostgreSQL 相关字段改为可选
   - 使用 `z.coerce` 简化类型转换

3. **向后兼容**：
   - `config.database` 和 `config.postgres` 的接口保持不变
   - 现有代码无需修改即可工作

### 类型安全

所有修改都保持了完整的 TypeScript 类型安全：

```typescript
// database.type 的类型是字面量类型
type DatabaseType = 'memory' | 'postgres' | 'sqlite';

// PostgreSQL 配置在使用时有适当的 undefined 检查
if (config.database.type === 'postgres') {
  // 这里可以安全地访问 postgres 配置
  const { host, port, user } = config.postgres;
}
```

## 测试

配置系统包含了完整的测试用例（`tests/config.test.ts`），覆盖：

- ✅ 开发环境默认使用 SQLite
- ✅ 生产环境默认使用 PostgreSQL
- ✅ 测试环境默认使用内存数据库
- ✅ 显式设置 DATABASE_TYPE 覆盖默认值
- ✅ PostgreSQL 配置验证逻辑
- ✅ 非 postgres 模式下 PostgreSQL 配置可选

## 常见问题

### Q: 我在开发环境想用 PostgreSQL 怎么办？

A: 显式设置 `DATABASE_TYPE=postgres` 并提供完整的 PostgreSQL 配置即可。

### Q: 生产环境可以使用 SQLite 吗？

A: 技术上可以，但不推荐。显式设置 `DATABASE_TYPE=sqlite` 即可，但生产环境建议使用 PostgreSQL 以获得更好的性能和可靠性。

### Q: 我需要更新代码吗？

A: 不需要。配置系统的接口保持不变，现有代码无需修改。

### Q: 如何验证当前使用的数据库类型？

A: 查看应用启动时的日志输出，会显示 `Database Type: xxx`。或在代码中访问 `config.database.type`。

## 相关文件

- **配置实现**: `/Users/Oychao/Documents/Projects/content-creator/src/config/index.ts`
- **配置示例**: `/Users/Oychao/Documents/Projects/content-creator/.env.example`
- **测试文件**: `/Users/Oychao/Documents/Projects/content-creator/tests/config.test.ts`
- **文档**: `/Users/Oychao/Documents/Projects/content-creator/docs/config-system-update.md`
