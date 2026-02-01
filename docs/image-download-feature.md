# 图片下载功能说明

## 🎉 功能已实现

图片生成节点现在会自动将生成的图片下载到本地！

## ✅ 已实现的功能

### 1. **自动下载**
- 图片生成成功后，自动下载到本地
- 默认保存路径：`./data/images/`
- 文件命名格式：`{taskId}_{index}_{timestamp}.png`

### 2. **数据结构更新**
`GeneratedImage` 接口新增字段：
```typescript
{
  url: string;              // 云端 URL
  localPath?: string;       // 本地路径（新增）✨
  prompt: string;
  width?: number;
  height?: number;
  format?: string;
}
```

### 3. **新增方法**
- `ImageService.downloadImage()` - 下载图片到本地
- `ImageService.generateImageFilename()` - 生成唯一文件名

### 4. **错误处理**
- 下载失败不影响工作流执行
- 云端 URL 始终可用
- 详细的日志记录

## 📁 文件存储

### 默认配置
```bash
# .env 文件
STORAGE_PROVIDER=local
STORAGE_PATH=./data/images
```

### 目录结构
```
content-creator/
└── data/
    └── images/
        ├── task-123_0_1769691079854.png
        ├── task-123_1_1769691079855.png
        └── test-image-1769691116489_0_1769691116489.png
```

## 🧪 测试验证

### 快速测试
```bash
# 直接测试图片生成和下载
npm run test:image-only
```

### 完整工作流测试
```bash
# 测试完整工作流（包含图片生成和下载）
npm run test:image-download
```

## 💡 使用示例

### 在工作流中自动下载

当执行内容创作工作流时，图片会自动下载：

```typescript
import { createSimpleContentCreatorGraph } from './domain/workflow/ContentCreatorGraph.js';
import { createInitialState } from './domain/workflow/State.js';

const graph = createSimpleContentCreatorGraph();
const state = createInitialState({
  taskId: 'my-task-001',
  mode: ExecutionMode.SYNC,
  topic: '人工智能技术',
  requirements: '写一篇 500 字的文章',
});

const result = await graph.invoke(state);

// 检查生成的图片
if (result.images && result.images.length > 0) {
  for (const image of result.images) {
    console.log('云端 URL:', image.url);
    console.log('本地路径:', image.localPath); // ✨ 已下载到本地
  }
}
```

### 直接使用 ImageService

```typescript
import { imageService } from './services/image/ImageService.js';

// 1. 生成图片
const result = await imageService.generateImage({
  prompt: '一张美丽的风景图',
  size: '1920x1920',
  watermark: false,
});

// 2. 下载到本地
const filename = imageService.generateImageFilename('task-001', 0, 'png');
const localPath = await imageService.downloadImage(result.imageUrl, filename);

console.log('图片已保存到:', localPath);
```

## 🔧 配置选项

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STORAGE_PROVIDER` | 存储类型 | `local` |
| `STORAGE_PATH` | 本地存储路径 | `./data/images` |

### 自定义存储路径

在 `.env` 文件中设置：
```bash
STORAGE_PATH=/path/to/your/images
```

## 📊 测试结果

```
🧪 图片下载功能测试成功！

📊 测试结果:
   ✅ 图片生成: 成功
   ✅ 图片下载: 成功
   ✅ 文件验证: 通过
   ✅ 文件大小: 937.21 KB

📁 图片保存位置:
   /Users/Oychao/Documents/Projects/content-creator/data/images
```

## 🛠️ 技术实现

### 核心代码

1. **图片下载方法** (`src/services/image/ImageService.ts:189`)
   ```typescript
   async downloadImage(imageUrl: string, filename: string): Promise<string> {
     const storagePath = config.storage.path || './data/images';
     const fullPath = join(storagePath, filename);
     await fs.mkdir(dirname(fullPath), { recursive: true });

     const response = await axios.get<ArrayBuffer>(imageUrl, {
       responseType: 'arraybuffer',
       timeout: 60000,
     });

     await fs.writeFile(fullPath, Buffer.from(response.data));
     return fullPath;
   }
   ```

2. **工作流集成** (`src/domain/workflow/nodes/GenerateImageNode.ts:226`)
   ```typescript
   // 下载图片到本地
   let localPath: string | undefined;
   try {
     const filename = imageService.generateImageFilename(taskId, index, 'png');
     localPath = await imageService.downloadImage(result.imageUrl, filename);
   } catch (downloadError) {
     // 下载失败不影响主流程
   }

   return {
     url: result.imageUrl,
     localPath,  // ✨ 包含本地路径
     prompt,
     width: 1024,
     height: 1024,
     format: 'png',
   };
   ```

## 📝 注意事项

1. **存储空间**：图片通常 800KB-1.5MB，注意磁盘空间
2. **下载超时**：默认 60 秒超时，大文件可能需要调整
3. **网络稳定**：下载需要稳定的网络连接
4. **目录权限**：确保 `data/images/` 目录有写权限
5. **Git 忽略**：`data/images/` 已添加到 `.gitignore`

## 🚀 下一步

可选的扩展功能：
- [ ] 支持其他存储后端（S3、OSS、MinIO）
- [ ] 图片压缩和优化
- [ ] 异步下载队列
- [ ] 下载进度显示
- [ ] 图片元数据提取

## 📞 反馈

如有问题或建议，请提交 Issue 或 PR。
