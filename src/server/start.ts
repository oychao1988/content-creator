#!/usr/bin/env node
/**
 * Content-Creator API 服务器启动入口
 */

const PORT = process.env.API_PORT || 18100;

console.log(`正在启动 Content-Creator API 服务器，端口: ${PORT}...`);

// 使用动态导入避免模块加载时的副作用
import('./index.js').then((module) => {
  console.log('模块加载成功，正在启动服务器...');

  return module.createApiServer(PORT);
}).catch((error) => {
  console.error('API 服务器启动失败:', error);
  process.exit(1);
});
