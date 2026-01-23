/**
 * 安全服务测试脚本
 *
 * 测试 API Key 管理和配额管理功能
 */

import { apiKeyService } from '../src/infrastructure/security/ApiKeyService.js';
import { quotaService } from '../src/infrastructure/security/QuotaService.js';
import { rateLimiter } from '../src/infrastructure/security/RateLimiter.js';

const TEST_USER_ID = 'test-user-001';

async function main() {
  console.log('========================================');
  console.log('安全服务测试脚本');
  console.log('========================================\n');

  // 测试 1: API Key 管理
  console.log('测试 1: API Key 管理');
  console.log('----------------------------------------');
  await testApiKeyManagement();
  console.log('');

  // 测试 2: 配额管理
  console.log('测试 2: 配额管理');
  console.log('----------------------------------------');
  await testQuotaManagement();
  console.log('');

  // 测试 3: 速率限制
  console.log('测试 3: 速率限制');
  console.log('----------------------------------------');
  await testRateLimiting();
  console.log('');

  console.log('========================================');
  console.log('所有测试完成！');
  console.log('========================================');
}

async function testApiKeyManagement() {
  try {
    // 1.1 创建 API Key
    console.log('1.1 创建 API Key...');
    const { apiKey, apiKeyId } = await apiKeyService.createApiKey({
      userId: TEST_USER_ID,
      name: '测试 API Key',
      description: '用于测试的 API Key',
      expiresIn: 30 * 24 * 3600, // 30 天
    });

    console.log('✅ API Key 创建成功');
    console.log(`   API Key ID: ${apiKeyId}`);
    console.log(`   API Key: ${apiKey.substring(0, 20)}...`);
    console.log('');

    // 1.2 验证 API Key
    console.log('1.2 验证 API Key...');
    const verifyResult = await apiKeyService.verifyApiKey(apiKey);

    if (verifyResult.valid) {
      console.log('✅ API Key 验证成功');
      console.log(`   用户 ID: ${verifyResult.userId}`);
      console.log(`   使用次数: ${verifyResult.apiKey?.usageCount || 0}`);
    } else {
      console.log('❌ API Key 验证失败');
    }
    console.log('');

    // 1.3 获取用户的 API Keys
    console.log('1.3 获取用户的 API Keys...');
    const apiKeys = await apiKeyService.getUserApiKeys(TEST_USER_ID);
    console.log(`✅ 找到 ${apiKeys.length} 个 API Key`);
    apiKeys.forEach(key => {
      console.log(`   - ${key.id}: ${key.metadata?.name || 'unnamed'} (活跃: ${key.is_active})`);
    });
    console.log('');

    // 1.4 禁用 API Key
    console.log('1.4 禁用 API Key...');
    const disabled = await apiKeyService.disableApiKey(apiKeyId);
    if (disabled) {
      console.log('✅ API Key 已禁用');
    }
    console.log('');

    // 1.5 重新验证（应该失败）
    console.log('1.5 验证已禁用的 API Key...');
    const verifyResult2 = await apiKeyService.verifyApiKey(apiKey);
    if (!verifyResult2.valid) {
      console.log('✅ 已禁用的 API Key 验证失败（符合预期）');
    } else {
      console.log('❌ 已禁用的 API Key 仍然可以验证（不符合预期）');
    }
    console.log('');

  } catch (error) {
    console.error('❌ API Key 管理测试失败:', error);
  }
}

async function testQuotaManagement() {
  try {
    // 2.1 获取用户配额
    console.log('2.1 获取用户配额...');
    const quota = await quotaService.getUserQuota(TEST_USER_ID);

    if (quota) {
      console.log('✅ 获取配额成功');
      console.log(`   每日配额: ${quota.quotaDaily}`);
      console.log(`   今日已用: ${quota.quotaUsedToday}`);
      console.log(`   已预留: ${quota.quotaReserved}`);
      console.log(`   可用配额: ${quota.quotaAvailable}`);
    } else {
      console.log('❌ 获取配额失败');
    }
    console.log('');

    // 2.2 检查配额
    console.log('2.2 检查是否有足够配额...');
    const hasQuota = await quotaService.checkQuota(TEST_USER_ID, 5);
    if (hasQuota) {
      console.log('✅ 有足够配额（需要 5 个）');
    } else {
      console.log('❌ 配额不足');
    }
    console.log('');

    // 2.3 预留配额
    console.log('2.3 预留配额（5 个）...');
    const reserveResult = await quotaService.reserveQuota(TEST_USER_ID, 5, 300);
    if (reserveResult.success) {
      console.log('✅ 配额预留成功');
      console.log(`   预留 ID: ${reserveResult.reservationId}`);
    } else {
      console.log('❌ 配额预留失败');
    }
    console.log('');

    if (reserveResult.reservationId) {
      // 2.4 消费配额
      console.log('2.4 消费配额...');
      const consumed = await quotaService.consumeQuota(TEST_USER_ID, reserveResult.reservationId);
      if (consumed) {
        console.log('✅ 配额消费成功');
      } else {
        console.log('❌ 配额消费失败');
      }
      console.log('');

      // 2.5 再次查看配额
      console.log('2.5 查看更新后的配额...');
      const quota2 = await quotaService.getUserQuota(TEST_USER_ID);
      if (quota2) {
        console.log(`   今日已用: ${quota2.quotaUsedToday} (增加了 5)`);
        console.log(`   可用配额: ${quota2.quotaAvailable} (减少了 5)`);
      }
    }

    console.log('');

  } catch (error) {
    console.error('❌ 配额管理测试失败:', error);
  }
}

async function testRateLimiting() {
  try {
    // 3.1 测试速率限制（滑动窗口）
    console.log('3.1 测试滑动窗口速率限制...');
    const config = {
      limit: 5,
      window: 60, // 60 秒
    };

    let passedCount = 0;
    for (let i = 0; i < 7; i++) {
      const result = await rateLimiter.checkLimit(
        `${TEST_USER_ID}-test`,
        config,
        'sliding-window'
      );

      if (result.allowed) {
        passedCount++;
        console.log(`   请求 ${i + 1}: ✅ 允许 (剩余: ${result.remaining})`);
      } else {
        console.log(`   请求 ${i + 1}: ❌ 限制 (重试后: ${result.retryAfter}秒)`);
      }
    }

    console.log(`✅ 前 ${passedCount} 个请求被允许，第 ${passedCount + 1} 个请求被限制（符合预期）`);
    console.log('');

    // 3.2 测试令牌桶算法
    console.log('3.2 测试令牌桶算法...');
    const tokenBucketConfig = {
      limit: 10,
      window: 60,
      burst: 20,
    };

    const tbResult = await rateLimiter.checkLimit(
      `${TEST_USER_ID}-token-bucket`,
      tokenBucketConfig,
      'token-bucket'
    );

    console.log(`✅ 令牌桶测试: ${tbResult.allowed ? '允许' : '限制'} (可用令牌: ${tbResult.remaining})`);
    console.log('');

    // 3.3 重置速率限制
    console.log('3.3 重置速率限制...');
    await rateLimiter.resetLimit(`${TEST_USER_ID}-test`, 'sliding-window');
    console.log('✅ 速率限制已重置');
    console.log('');

  } catch (error) {
    console.error('❌ 速率限制测试失败:', error);
  }
}

// 运行测试
main().catch(error => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
});
