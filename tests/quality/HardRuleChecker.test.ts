/**
 * HardRuleChecker 测试
 *
 * 测试硬规则检查器的各项功能
 */

import { describe, it, expect } from 'vitest';
import { HardRuleChecker } from '../../src/services/quality/HardRuleChecker.js';

describe('HardRuleChecker', () => {
  let checker: HardRuleChecker;

  beforeEach(() => {
    checker = new HardRuleChecker();
  });

  describe('字数检查', () => {
    it('应该通过字数检查（在范围内）', () => {
      const content = '这是一个测试内容。' + '更多内容。'.repeat(10);
      const result = checker.check(content, {
        minWords: 10,
        maxWords: 100,
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.details.wordCount?.passed).toBe(true);
    });

    it('应该在字数不足时失败', () => {
      const content = '短内容';
      const result = checker.check(content, {
        minWords: 50,
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details.wordCount?.passed).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].category).toBe('word_count');
      expect(result.issues[0].severity).toBe('error');
    });

    it('应该在字数超标时失败', () => {
      const content = '很长的内容。'.repeat(100);
      const result = checker.check(content, {
        maxWords: 50,
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details.wordCount?.passed).toBe(false);
      expect(result.issues[0].category).toBe('word_count');
    });

    it('应该在无字数限制时通过', () => {
      const content = '任意长度的内容';
      const result = checker.check(content, {});

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });
  });

  describe('关键词检查', () => {
    it('应该通过关键词检查（包含所有关键词）', () => {
      const content = '这篇文章讨论了人工智能和机器学习的发展';
      const result = checker.check(content, {
        keywords: ['人工智能', '机器学习'],
        requireAllKeywords: true,
      });

      expect(result.passed).toBe(true);
      expect(result.details.keywords?.passed).toBe(true);
      expect(result.details.keywords?.found).toEqual(['人工智能', '机器学习']);
      expect(result.details.keywords?.missing).toEqual([]);
    });

    it('应该在缺少必需关键词时失败', () => {
      const content = '这篇文章讨论了人工智能';
      const result = checker.check(content, {
        keywords: ['人工智能', '机器学习'],
        requireAllKeywords: true,
      });

      expect(result.passed).toBe(false);
      expect(result.details.keywords?.passed).toBe(false);
      expect(result.details.keywords?.found).toEqual(['人工智能']);
      expect(result.details.keywords?.missing).toEqual(['机器学习']);
    });

    it('应该通过关键词检查（至少一个关键词）', () => {
      const content = '这篇文章讨论了人工智能的发展';
      const result = checker.check(content, {
        keywords: ['人工智能', '机器学习', '深度学习'],
        requireAllKeywords: false,
      });

      expect(result.passed).toBe(true);
      expect(result.details.keywords?.passed).toBe(true);
    });

    it('应该在缺少所有关键词时失败（至少一个模式）', () => {
      const content = '这篇文章讨论了计算机科学';
      const result = checker.check(content, {
        keywords: ['人工智能', '机器学习'],
        requireAllKeywords: false,
      });

      expect(result.passed).toBe(false);
      expect(result.details.keywords?.passed).toBe(false);
    });

    it('应该不区分大小写匹配关键词', () => {
      const content = 'This article discusses ARTIFICIAL INTELLIGENCE';
      const result = checker.check(content, {
        keywords: ['artificial', 'intelligence'],
        requireAllKeywords: true,
      });

      expect(result.passed).toBe(true);
    });

    it('应该在无关键词要求时通过', () => {
      const content = '任意内容';
      const result = checker.check(content, {});

      expect(result.passed).toBe(true);
    });
  });

  describe('结构检查', () => {
    it('应该通过结构检查（包含标题）', () => {
      const content = '文章标题\n\n这是文章内容...';
      const result = checker.check(content, {
        requireTitle: true,
      });

      expect(result.passed).toBe(true);
      expect(result.details.structure?.hasTitle).toBe(true);
    });

    it('应该在缺少标题时失败', () => {
      const content = '这是很长的文章内容而没有明显的标题，应该被识别为普通正文而不是标题。这是一个很长的句子，包含很多文字内容，远超过标题应有的长度。';
      const result = checker.check(content, {
        requireTitle: true,
      });

      expect(result.passed).toBe(false);
      expect(result.details.structure?.hasTitle).toBe(false);
      expect(result.issues[0].category).toBe('structure');
    });

    it('应该通过结构检查（包含导语）', () => {
      const content = '这是一段简短的导语文字。\n\n这是正文内容...';
      const result = checker.check(content, {
        requireIntro: true,
      });

      expect(result.passed).toBe(true);
      expect(result.details.structure?.hasIntro).toBe(true);
    });

    it('应该在缺少导语时失败', () => {
      const content = '没有导语的正文内容';
      const result = checker.check(content, {
        requireIntro: true,
      });

      expect(result.passed).toBe(false);
      expect(result.details.structure?.hasIntro).toBe(false);
    });

    it('应该通过结构检查（包含结尾）', () => {
      const content = '这是正文内容。\n\n这是总结性的结尾段落。';
      const result = checker.check(content, {
        requireConclusion: true,
      });

      expect(result.passed).toBe(true);
      expect(result.details.structure?.hasConclusion).toBe(true);
    });

    it('应该在段落数不足时失败', () => {
      const content = '段落一\n段落二';
      const result = checker.check(content, {
        minSections: 5,
      });

      expect(result.passed).toBe(false);
      expect(result.details.structure?.passed).toBe(false);
    });

    it('应该在缺少项目符号时失败', () => {
      const content = '没有项目符号的内容';
      const result = checker.check(content, {
        hasBulletPoints: true,
      });

      expect(result.passed).toBe(false);
      expect(result.details.structure?.hasBulletPoints).toBe(false);
    });

    it('应该通过结构检查（包含项目符号）', () => {
      const content = '- 项目一\n- 项目二\n- 项目三';
      const result = checker.check(content, {
        hasBulletPoints: true,
      });

      expect(result.passed).toBe(true);
      expect(result.details.structure?.hasBulletPoints).toBe(true);
    });

    it('应该在缺少编号列表时失败', () => {
      const content = '没有编号列表的内容';
      const result = checker.check(content, {
        hasNumberedList: true,
      });

      expect(result.passed).toBe(false);
      expect(result.details.structure?.hasNumberedList).toBe(false);
    });

    it('应该通过结构检查（包含编号列表）', () => {
      const content = '1. 第一项\n2. 第二项\n3. 第三项';
      const result = checker.check(content, {
        hasNumberedList: true,
      });

      expect(result.passed).toBe(true);
      expect(result.details.structure?.hasNumberedList).toBe(true);
    });
  });

  describe('禁用词检查', () => {
    it('应该通过禁用词检查（无禁用词）', () => {
      const content = '这是正常的内容';
      const result = checker.check(content, {
        forbiddenWords: ['违规词1', '违规词2'],
      });

      expect(result.passed).toBe(true);
      expect(result.details.forbiddenWords?.passed).toBe(true);
      expect(result.details.forbiddenWords?.found).toEqual([]);
    });

    it('应该在包含禁用词时失败', () => {
      const content = '这是包含违规词1的内容';
      const result = checker.check(content, {
        forbiddenWords: ['违规词1', '违规词2'],
      });

      expect(result.passed).toBe(false);
      expect(result.details.forbiddenWords?.passed).toBe(false);
      expect(result.details.forbiddenWords?.found).toContain('违规词1');
      expect(result.issues[0].category).toBe('forbidden_words');
    });

    it('应该不区分大小写检测禁用词', () => {
      const content = 'This contains FORBIDDEN word';
      const result = checker.check(content, {
        forbiddenWords: ['forbidden'],
      });

      expect(result.passed).toBe(false);
      expect(result.details.forbiddenWords?.found).toContain('forbidden');
    });

    it('应该在无禁用词要求时通过', () => {
      const content = '任意内容';
      const result = checker.check(content, {});

      expect(result.passed).toBe(true);
    });
  });

  describe('综合检查', () => {
    it('应该通过所有检查', () => {
      const content = `文章标题

这是一段导语内容，介绍文章的主题。

- 项目一
- 项目二

1. 第一点
2. 第二点

这是正文内容，包含人工智能和机器学习的讨论。

这是结尾段落，总结全文。`;

      const result = checker.check(content, {
        minWords: 50,
        maxWords: 500,
        keywords: ['人工智能', '机器学习'],
        requireAllKeywords: false,
        requireTitle: true,
        requireIntro: true,
        requireConclusion: true,
        minSections: 3,
        hasBulletPoints: true,
        hasNumberedList: true,
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('应该在多个规则失败时返回所有问题', () => {
      const content = '短内容';

      const result = checker.check(content, {
        minWords: 50,
        keywords: ['必需关键词'],
        requireTitle: true,
        requireIntro: true,
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues.length).toBeGreaterThan(1);

      const categories = result.issues.map(issue => issue.category);
      expect(categories).toContain('word_count');
      expect(categories).toContain('keywords');
      expect(categories).toContain('structure');
    });

    it('应该生成有用的修复建议', () => {
      const content = '短';

      const result = checker.check(content, {
        minWords: 100,
        keywords: ['AI', '技术'],
        requireTitle: true,
      });

      // HardRuleChecker 返回 issues 数组，包含 suggestion 字段
      expect(result.issues.length).toBeGreaterThan(0);

      // 检查是否包含有建议的 issue
      const hasSuggestion = result.issues.some(issue => issue.suggestion !== undefined);
      expect(hasSuggestion).toBe(true);

      // 检查建议文本是否包含有用信息
      const suggestions = result.issues
        .filter(issue => issue.suggestion)
        .map(issue => issue.suggestion!)
        .join(' ');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('边界情况', () => {
    it('应该处理空内容', () => {
      const content = '';
      const result = checker.check(content, {
        minWords: 1,
      });

      expect(result.passed).toBe(false);
    });

    it('应该处理只有空格的内容', () => {
      const content = '   \n\n   ';
      const result = checker.check(content, {
        minWords: 1,
      });

      expect(result.passed).toBe(false);
    });

    it('应该处理超长内容', () => {
      const content = '内容'.repeat(10000);
      const result = checker.check(content, {});

      expect(result).toBeDefined();
      expect(result.score).toBeDefined();
    });

    it('应该处理特殊字符', () => {
      const content = '特殊字符：!@#$%^&*()_+-={}[]|\\:";\'<>?,./《》【】';
      const result = checker.check(content, {
        minWords: 1,
      });

      expect(result).toBeDefined();
    });
  });

  describe('静态方法', () => {
    it('应该验证约束规则', () => {
      const validConstraints = {
        minWords: 100,
        maxWords: 1000,
        keywords: ['test'],
      };

      expect(() => {
        HardRuleChecker.validateConstraints(validConstraints);
      }).not.toThrow();
    });

    it('应该在约束规则无效时抛出错误', () => {
      const invalidConstraints = {
        minWords: 'invalid' as any,
      };

      expect(() => {
        HardRuleChecker.validateConstraints(invalidConstraints);
      }).toThrow();
    });
  });

  describe('统计信息', () => {
    it('应该返回详细的检查信息', () => {
      const content = '测试内容';
      const result = checker.check(content, {
        minWords: 1,
        keywords: ['测试'],
      });

      expect(result.details).toBeDefined();
      expect(result.details.wordCount).toBeDefined();
      expect(result.details.keywords).toBeDefined();
      expect(result.checkedAt).toBeDefined();
      expect(result.checkedAt).toBeLessThanOrEqual(Date.now());
    });
  });
});
