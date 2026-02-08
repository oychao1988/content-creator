#!/bin/bash

# Webhook 回调集成测试快速验证脚本
#
# 使用方法:
#   ./scripts/test-webhook-integration.sh [选项]
#
# 选项:
#   --coverage        包含覆盖率报告
#   --watch           监听模式
#   --verbose         详细输出
#   --help            显示帮助

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认选项
WITH_COVERAGE=false
WATCH_MODE=false
VERBOSE_MODE=false

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --coverage)
      WITH_COVERAGE=true
      shift
      ;;
    --watch)
      WATCH_MODE=true
      shift
      ;;
    --verbose)
      VERBOSE_MODE=true
      shift
      ;;
    --help)
      echo "Webhook 回调集成测试快速验证脚本"
      echo ""
      echo "使用方法:"
      echo "  ./scripts/test-webhook-integration.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --coverage        包含覆盖率报告"
      echo "  --watch           监听模式"
      echo "  --verbose         详细输出"
      echo "  --help            显示帮助"
      echo ""
      echo "示例:"
      echo "  ./scripts/test-webhook-integration.sh --coverage"
      echo "  ./scripts/test-webhook-integration.sh --watch"
      exit 0
      ;;
    *)
      echo -e "${RED}未知选项: $1${NC}"
      echo "使用 --help 查看帮助"
      exit 1
      ;;
  esac
done

# 打印开始信息
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Webhook 回调集成测试${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 清理端口 3000
echo -e "${YELLOW}正在清理端口 3000...${NC}"
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# 构建测试命令
TEST_CMD="pnpm test tests/integration/webhook-callback-integration.test.ts"

if [ "$VERBOSE_MODE" = true ]; then
  TEST_CMD="$TEST_CMD --reporter=verbose"
fi

if [ "$WITH_COVERAGE" = true ]; then
  TEST_CMD="$TEST_CMD --coverage"
fi

if [ "$WATCH_MODE" = true ]; then
  TEST_CMD="$TEST_CMD --watch"
fi

# 运行测试
echo -e "${YELLOW}正在运行测试...${NC}"
echo ""
echo -e "${BLUE}命令: $TEST_CMD${NC}"
echo ""

if eval "$TEST_CMD"; then
  echo ""
  echo -e "${GREEN}======================================${NC}"
  echo -e "${GREEN}✓ 所有测试通过！${NC}"
  echo -e "${GREEN}======================================${NC}"
  echo ""

  # 显示测试结果文件
  if [ -f "test-webhook-callbacks.json" ]; then
    echo -e "${BLUE}测试数据文件:${NC}"
    echo -e "  ${GREEN}✓${NC} test-webhook-callbacks.json ($(ls -lh test-webhook-callbacks.json | awk '{print $5}'))"
  fi

  # 显示覆盖率报告
  if [ "$WITH_COVERAGE" = true ] && [ -f "coverage/index.html" ]; then
    echo ""
    echo -e "${BLUE}覆盖率报告:${NC}"
    echo -e "  ${GREEN}✓${NC} coverage/index.html"
    echo ""
    echo -e "${YELLOW}提示: 在浏览器中打开 coverage/index.html 查看详细报告${NC}"
  fi

  echo ""
  echo -e "${BLUE}测试文档:${NC}"
  echo -e "  ${GREEN}✓${NC} docs/test/webhook-callback-integration-test-report.md"
  echo -e "  ${GREEN}✓${NC} docs/test/webhook-callback-test-summary.md"
  echo ""

  exit 0
else
  echo ""
  echo -e "${RED}======================================${NC}"
  echo -e "${RED}✗ 测试失败${NC}"
  echo -e "${RED}======================================${NC}"
  echo ""
  exit 1
fi
