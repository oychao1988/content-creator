/**
 * Workflow Scaffolding Module
 *
 * AI-Native 工作流脚手架系统的主入口
 */

// Schema 导出
export {
  WorkflowRequirementSchema,
  ParamDefinitionSchema,
  NodeDesignSchema,
  ConnectionSchema,
  WorkflowCategoryEnum,
  NodeTypeEnum,
  type WorkflowRequirement,
  type ParamDefinition,
  type NodeDesign,
  type Connection,
  type ValidationResult,
  validateWorkflowRequirement,
  getDefaultWorkflowRequirement,
} from './schemas/WorkflowRequirementSchema.js';

// AI Engine 导出
export {
  AINeuralUnderstandingEngine,
  type UnderstandingResult,
  type OptimizationResult,
  type ContextConfig,
} from './ai/AINeuralUnderstandingEngine.js';

// Code Generator 导出
export {
  AICodeGenerator,
  type CodeGeneratorConfig,
} from './ai/AICodeGenerator.js';

// Context Builder 导出
export {
  buildProjectContext,
  extractCodePatterns,
  extractExistingWorkflows,
  type ProjectContext,
  type CodePatterns,
} from './utils/contextBuilder.js';

// Prompts 导出
export {
  buildWorkflowUnderstandingPrompt,
  buildOptimizationPrompt,
  TEXT_SUMMARY_EXAMPLE,
  TRANSLATION_EXAMPLE,
  CONTENT_CREATION_EXAMPLE,
  BATCH_PROCESSING_EXAMPLE,
} from './ai/prompts/understanding.js';

// Validation Prompts 导出
export {
  CODE_VALIDATION_PROMPT,
  ValidationDimension,
  ValidationDimensionDescriptions,
  type CodeValidationResult,
  type DimensionScore,
  type CodeIssue,
  type CodeImprovement,
  type AutoFixableIssue,
} from './ai/prompts/validate.js';

// Visualization 导出
export {
  MermaidDiagramGenerator,
  NodeTableGenerator,
  DataFlowDiagramGenerator,
  VisualizationPreviewSystem,
  type MermaidDirection,
  type MermaidGeneratorConfig,
  type TableColumn,
  type NodeTableConfig,
  type DataFlowConfig,
  type PreviewSystemConfig,
} from './visualization/index.js';

// Validation 导出
export {
  BestPracticeChecker,
  AutoValidatorOptimizer,
  type BestPracticeResult,
  type BestPracticeIssue,
  type BestPracticeCheckerConfig,
  type CodeValidationResult,
  type FileValidationResult,
  type ValidationIssue,
  type ValidationStats,
  type AutoFixConfig,
} from './validation/index.js';
