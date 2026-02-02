import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function getProjectRootFromModule(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, '../../../..');
}

function resolvePromptFilePath(promptRelativePath: string): string {
  const candidates = [
    resolve(process.cwd(), 'prompts', promptRelativePath),
    resolve(getProjectRootFromModule(), 'prompts', promptRelativePath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Prompt file not found: ${promptRelativePath}. Tried: ${candidates.join(', ')}`
  );
}

export class PromptLoader {
  private static cache = new Map<string, string>();

  static clearCache(): void {
    this.cache.clear();
  }

  static render(template: string, params: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
      return params[key] ?? '';
    });
  }

  static async load(promptRelativePath: string): Promise<string> {
    const fullPath = resolvePromptFilePath(promptRelativePath);

    const shouldCache = process.env.NODE_ENV === 'production';

    if (shouldCache) {
      const cached = this.cache.get(fullPath);
      if (cached) {
        return cached;
      }
    }

    const content = (await readFile(fullPath, 'utf8')).replace(/\r\n/g, '\n');

    if (shouldCache) {
      this.cache.set(fullPath, content);
    }

    return content;
  }

  static async renderFromFile(
    promptRelativePath: string,
    params: Record<string, string>
  ): Promise<string> {
    const template = await this.load(promptRelativePath);
    return this.render(template, params);
  }
}
