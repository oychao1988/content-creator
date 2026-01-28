# NPM 发布检查清单

## ✅ 发布前检查

### 版本信息
- [x] package.json 版本已更新为 0.2.0
- [x] package.json description 已更新
- [x] package.json keywords 已更新（添加工作流相关关键词）
- [x] package.json exports 已更新（工作流相关导出）

### 文档
- [x] README.md 已更新（添加 npm 使用说明）
- [x] README.md 版本信息已更新
- [x] CHANGELOG.md 已创建并填写完整
- [x] 文档目录已更新（docs/README.md）

### 代码质量
- [x] TypeScript 编译成功（dist/ 目录已更新）
- [x] 所有新功能都已包含在构建中
  - BaseWorkflowState.ts ✓
  - WorkflowRegistry.ts ✓
  - adapters/ 目录 ✓
  - examples/ 目录 ✓
  - workflow CLI 命令 ✓

### 配置文件
- [x] .npmignore 已配置正确
- [x] package.json files 字段包含必要文件
- [x] package.json exports 配置正确
- [x] package.json bin 配置正确

### 测试
- [x] 单元测试通过
- [x] 集成测试通过（工作流注册表、翻译工作流）
- [x] 性能测试阈值已调整

## 📋 发布步骤

### 1. 最终检查
```bash
# 查看待提交的文件
git status

# 确认构建版本
pnpm run build

# 运行测试（可选）
pnpm run test:unit
```

### 2. 提交更新
```bash
# 添加所有更新的文件
git add package.json README.md CHANGELOG.md

# 提交
git commit -m "chore: 准备发布 v0.2.0 到 npm

- 更新版本号为 0.2.0
- 更新 package.json 描述和关键词
- 添加 npm 使用说明到 README.md
- 创建 CHANGELOG.md 记录版本历史
- 更新文档版本信息"

# 推送到远程仓库（如果需要）
git push origin main
```

### 3. 发布到 npm
```bash
# 检查 npm 登录状态
npm whoami

# 如果未登录，先登录
npm login

# 发布包（公开访问）
npm publish --access public

# 或使用 dry-run 模式预览（不实际发布）
npm publish --dry-run --access public
```

### 4. 验证发布
```bash
# 在新目录中测试安装
cd /tmp
mkdir test-npm-package
cd test-npm-package
npm init -y
npm install llm-content-creator

# 测试导入
node -e "console.log(require('llm-content-creator/workflow'))"

# 或使用 ES 模块
node --input-type=module -e "import pkg from 'llm-content-creator/workflow'; console.log(pkg)"
```

## 📝 发布后事项

1. **验证 npm 页面**
   - 访问 https://www.npmjs.com/package/llm-content-creator
   - 检查包信息是否正确显示

2. **创建 GitHub Release**（可选）
   ```bash
   # 为当前版本创建 Git tag
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. **更新文档**
   - 确保文档链接正确
   - 更新使用示例

## ⚠️ 注意事项

- 确保 API Keys 等敏感信息未包含在发布包中
- 检查 .npmignore 是否正确配置
- 确认所有依赖都正确列在 package.json 中
- 验证 CLI 命令可以正常工作

## 🔄 回滚计划

如果发现问题需要回滚：
```bash
# 取消发布（npm 允许在 24 小时内撤回）
npm unpublish llm-content-creator@0.2.0

# 或发布修复版本
npm version patch  # 0.2.1
npm publish --access public
```

---

**当前状态**: ✅ 所有检查项已完成，可以安全发布
**准备就绪时间**: 2026-01-28
