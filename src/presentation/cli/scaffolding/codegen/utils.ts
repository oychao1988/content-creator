/**
 * Code Generation Utilities - 代码生成工具函数
 *
 * 提供代码生成过程中使用的工具函数
 */

/**
 * 转换为 PascalCase
 *
 * @example
 * toPascalCase('content-creator') => 'ContentCreator'
 * toPascalCase('translate_node') => 'TranslateNode'
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * 转换为 camelCase
 *
 * @example
 * toCamelCase('content-creator') => 'contentCreator'
 * toCamelCase('Translate_Node') => 'translateNode'
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * 转换为 kebab-case
 *
 * @example
 * toKebabCase('contentCreator') => 'content-creator'
 * toKebabCase('TranslateNode') => 'translate-node'
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * 从代码中提取类名
 *
 * @param code - TypeScript 代码
 * @returns 类名，如果未找到则返回 null
 */
export function extractClassName(code: string): string | null {
  // 匹配 class XxxNode 或 class Xxx
  const classMatch = code.match(/\bclass\s+(\w+)\s+(?:extends|implements|\{)/);
  if (classMatch) {
    return classMatch[1];
  }

  // 匹配 interface Xxx
  const interfaceMatch = code.match(/\binterface\s+(\w+)\s+(?:extends|\{)/);
  if (interfaceMatch) {
    return interfaceMatch[1];
  }

  return null;
}

/**
 * 从代码中提取接口名
 *
 * @param code - TypeScript 代码
 * @returns 接口名，如果未找到则返回 null
 */
export function extractInterfaceName(code: string): string | null {
  const match = code.match(/\binterface\s+(\w+)\s+extends/);
  if (match) {
    return match[1];
  }

  // 尝试匹配不继承的接口
  const standaloneMatch = code.match(/\binterface\s+(\w+)\s*\{/);
  if (standaloneMatch) {
    return standaloneMatch[1];
  }

  return null;
}

/**
 * 从代码中提取函数名
 *
 * @param code - TypeScript 代码
 * @returns 函数名，如果未找到则返回 null
 */
export function extractFunctionName(code: string): string | null {
  // 匹配 function createXxx
  const functionMatch = code.match(/\bfunction\s+(\w+)\s*\(/);
  if (functionMatch) {
    return functionMatch[1];
  }

  // 匹配 const createXxx = ()
  const constMatch = code.match(/const\s+(\w+)\s*=\s*(?:async\s+)?\(?/);
  if (constMatch) {
    return constMatch[1];
  }

  return null;
}

/**
 * 生成 import 语句
 *
 * @param imports - 导入项数组 { name: string, from: string, isDefault?: boolean, isType?: boolean }
 * @returns import 语句字符串
 */
export function generateImports(
  imports: Array<{
    name: string;
    from: string;
    isDefault?: boolean;
    isType?: boolean;
  }>
): string {
  const groupedImports = new Map<string, Array<{ name: string; isDefault?: boolean; isType?: boolean }>>();

  // 按来源分组
  for (const imp of imports) {
    if (!groupedImports.has(imp.from)) {
      groupedImports.set(imp.from, []);
    }
    groupedImports.get(imp.from)!.push(imp);
  }

  // 生成 import 语句
  const importStatements: string[] = [];

  for (const [from, items] of groupedImports.entries()) {
    const defaultImports = items.filter((i) => i.isDefault).map((i) => i.name);
    const typeImports = items.filter((i) => i.isType && !i.isDefault).map((i) => i.name);
    const regularImports = items.filter((i) => !i.isDefault && !i.isType).map((i) => i.name);

    const parts: string[] = [];

    // 默认导入
    if (defaultImports.length > 0) {
      parts.push(defaultImports.join(', '));
    }

    // 命名导入
    if (regularImports.length > 0) {
      parts.push(`{ ${regularImports.join(', ')} }`);
    }

    // 类型导入
    if (typeImports.length > 0) {
      parts.push(`{ type ${typeImports.join(', type ')} }`);
    }

    importStatements.push(`import ${parts.join(', ')} from '${from}';`);
  }

  return importStatements.join('\n');
}

/**
 * 生成节点类导入语句
 *
 * @param nodeClasses - 节点类名数组
 * @param relativePath - 相对路径（默认 './nodes/'）
 * @returns import 语句
 */
export function generateNodeImports(nodeClasses: string[], relativePath: string = './nodes/'): string {
  return nodeClasses
    .map((className) => {
      const fileName = className.replace(/Node$/, ''); // 移除 Node 后缀
      return `import { ${className} } from '${relativePath}${fileName}.js';`;
    })
    .join('\n');
}

/**
 * 清理代码
 *
 * - 移除多余的空行
 * - 移除行尾空格
 * - 统一换行符
 *
 * @param code - 原始代码
 * @returns 清理后的代码
 */
export function cleanCode(code: string): string {
  return code
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n'); // 最多两个连续换行
}

/**
 * 验证类名
 *
 * @param name - 类名
 * @returns 是否有效
 */
export function isValidClassName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * 验证接口名
 *
 * @param name - 接口名
 * @returns 是否有效
 */
export function isValidInterfaceName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * 验证变量名
 *
 * @param name - 变量名
 * @returns 是否有效
 */
export function isValidVariableName(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

/**
 * 验证文件名
 *
 * @param name - 文件名
 * @returns 是否有效
 */
export function isValidFileName(name: string): boolean {
  return /^[a-z][a-z0-9-]*\.(ts|js)$/.test(name);
}

/**
 * 生成文件名
 *
 * @param className - 类名
 * @returns 文件名
 */
export function generateFileName(className: string): string {
  // 移除 Node 或 Factory 等后缀
  const baseName = className.replace(/(Node|Factory|Workflow)$/, '');
  return toKebabCase(baseName);
}

/**
 * 从节点名生成类名
 *
 * @param nodeName - 节点名（camelCase）
 * @returns 节点类名（PascalCase + Node）
 */
export function nodeNameToClassName(nodeName: string): string {
  return toPascalCase(nodeName) + 'Node';
}

/**
 * 从工作流类型生成状态接口名
 *
 * @param workflowType - 工作流类型（kebab-case）
 * @returns 状态接口名（PascalCase + State）
 */
export function workflowTypeToStateName(workflowType: string): string {
  return toPascalCase(workflowType) + 'State';
}

/**
 * 从工作流类型生成工厂类名
 *
 * @param workflowType - 工作流类型（kebab-case）
 * @returns 工厂类名（PascalCase + WorkflowFactory）
 */
export function workflowTypeToFactoryName(workflowType: string): string {
  return toPascalCase(workflowType) + 'WorkflowFactory';
}

/**
 * 从工作流类型生成工厂实例名
 *
 * @param workflowType - 工作流类型（kebab-case）
 * @returns 工厂实例名（camelCase）
 */
export function workflowTypeToFactoryInstanceName(workflowType: string): string {
  return toCamelCase(workflowType) + 'WorkflowFactory';
}

/**
 * 提取 JSDoc 注释
 *
 * @param code - 代码
 * @returns JSDoc 注释内容（如果存在）
 */
export function extractJSDoc(code: string): string | null {
  const match = code.match(/^\/\*\*\n([\s\S]*?)\n\*\//);
  return match ? match[1].trim() : null;
}

/**
 * 添加 JSDoc 注释
 *
 * @param code - 代码
 * @param comment - JSDoc 注释内容
 * @returns 带注释的代码
 */
export function addJSDoc(code: string, comment: string): string {
  const lines = comment.split('\n');
  const formattedComment = ['/**', ...lines.map((line) => ` * ${line}`), '*/'].join('\n');
  return `${formattedComment}\n${code}`;
}

/**
 * 计算代码行数（不包括空行和注释）
 *
 * @param code - 代码
 * @returns 有效代码行数
 */
export function countEffectiveLines(code: string): number {
  return code
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('/*')
      );
    })
    .length;
}

/**
 * 检查代码是否包含导入语句
 *
 * @param code - 代码
 * @returns 是否包含 import
 */
export function hasImports(code: string): boolean {
  return code.includes('import ');
}

/**
 * 检查代码是否包含导出语句
 *
 * @param code - 代码
 * @returns 是否包含 export
 */
export function hasExports(code: string): boolean {
  return code.includes('export ');
}

/**
 * 提取所有导出项
 *
 * @param code - 代码
 * @returns 导出项名称数组
 */
export function extractExports(code: string): string[] {
  const exports: string[] = [];

  // 匹配 export class Xxx
  const classMatch = code.match(/export\s+class\s+(\w+)/g);
  if (classMatch) {
    exports.push(...classMatch.map((m) => m.replace(/export\s+class\s+/, '')));
  }

  // 匹配 export interface Xxx
  const interfaceMatch = code.match(/export\s+interface\s+(\w+)/g);
  if (interfaceMatch) {
    exports.push(...interfaceMatch.map((m) => m.replace(/export\s+interface\s+/, '')));
  }

  // 匹配 export function xxx
  const functionMatch = code.match(/export\s+function\s+(\w+)/g);
  if (functionMatch) {
    exports.push(...functionMatch.map((m) => m.replace(/export\s+function\s+/, '')));
  }

  // 匹配 export const xxx
  const constMatch = code.match(/export\s+const\s+(\w+)/g);
  if (constMatch) {
    exports.push(...constMatch.map((m) => m.replace(/export\s+const\s+/, '')));
  }

  return exports;
}

/**
 * 生成模块导出索引
 *
 * @param exports - 导出项数组 { name: string, from: string }
 * @returns 索引文件内容
 */
export function generateIndexFile(
  exports: Array<{
    name: string;
    from: string;
    isDefault?: boolean;
  }>
): string {
  const lines: string[] = [];

  for (const exp of exports) {
    if (exp.isDefault) {
      lines.push(`export { default as ${exp.name} } from '${exp.from}';`);
    } else {
      lines.push(`export { ${exp.name} } from '${exp.from}';`);
    }
  }

  return lines.join('\n');
}

/**
 * 合并代码块
 *
 * @param blocks - 代码块数组
 * @param separator - 分隔符（默认两个换行）
 * @returns 合并后的代码
 */
export function mergeCodeBlocks(blocks: string[], separator: string = '\n\n'): string {
  return blocks.filter((block) => block.trim().length > 0).join(separator);
}

/**
 * 格式化 JSON 为带缩进的字符串
 *
 * @param obj - JavaScript 对象
 * @param indent - 缩进空格数（默认 2）
 * @returns 格式化的 JSON 字符串
 */
export function formatJSON(obj: any, indent: number = 2): string {
  return JSON.stringify(obj, null, indent);
}

/**
 * 从 JSON 字符串安全解析
 *
 * @param json - JSON 字符串
 * @param fallback - 解析失败时的默认值
 * @returns 解析结果或默认值
 */
export function safeParseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
