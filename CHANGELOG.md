# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-28

### Added
- **Multi-Workflow Architecture**
  - Implement `WorkflowRegistry` for dynamic workflow management
  - Add `BaseWorkflowState` base class for unified state management
  - Implement `ContentCreatorWorkflowAdapter` for backward compatibility
  - Add `TranslationWorkflow` with full language translation support
  - Support custom workflow registration and discovery

- **CLI Enhancements**
  - Add `workflow` command group (`list`, `info`)
  - Support multiple workflow types via `--type` parameter
  - Add translation-specific CLI options (`--source-text`, `--source-language`, `--target-language`)

- **Developer Experience**
  - Add workflow factory interface for type-safe workflow creation
  - Implement workflow metadata system (name, version, description, examples)
  - Add comprehensive parameter validation
  - Provide workflow discovery and listing capabilities

- **Documentation**
  - Add workflow extension architecture design document
  - Add workflow extension development guide
  - Add translation workflow usage guide
  - Add workflow adapter usage examples
  - Include comparison and future development guides

- **Testing**
  - Add comprehensive integration tests for WorkflowRegistry
  - Add translation workflow integration tests
  - Add CLI workflow command tests
  - Fix performance test thresholds for remote Redis
  - Resolve API rate limiting issues in integration tests

- **Examples**
  - Add `workflow-adapter-demo.ts` showcasing new architecture
  - Add `translation-workflow-example.ts` for translation usage
  - Update existing examples to use workflow registry

### Changed
- Update package.json exports to expose workflow registry
- Update README.md with multi-workflow usage instructions
- Enhance package keywords for better npm discoverability
- Improve error handling across workflow nodes

### Fixed
- Fix TaskWorker tests with proper WorkflowRegistry mocking
- Adjust performance test thresholds for network latency
- Add delay mechanisms to prevent API rate limiting in tests

### Technical Details
- **Backward Compatibility**: All existing APIs continue to work
- **Type Safety**: Full TypeScript support with generics
- **Extensibility**: Plugin-based architecture allows easy workflow additions
- **Documentation**: Comprehensive guides for adding new workflows

## [0.1.3] - 2026-01-22

### Added
- Monitor panel with Bull Board integration
- Task scheduler for delayed task execution
- Enhanced error tracking with Sentry
- Performance optimization and monitoring

### Changed
- Improve worker stability and error handling
- Update CLI commands for better user experience

## [0.1.2] - 2026-01-20

### Added
- Task retry functionality
- CLI commands for task management (list, status, result, retry, cancel)
- Enhanced error messages and logging

### Fixed
- Fix CLI hanging issues after command execution
- Improve task state management

## [0.1.1] - 2026-01-18

### Added
- Quality check service with hard rules and LLM evaluation
- Image generation integration with Doubao API
- Token usage tracking

### Changed
- Refactor workflow nodes for better modularity
- Improve error handling across all services

## [0.1.0] - 2026-01-15

### Added
- Initial release with core content creation workflow
- LangGraph-based workflow execution
- Sync and async execution modes
- PostgreSQL and SQLite database support
- BullMQ task queue system
- Basic CLI interface
- Comprehensive testing infrastructure

---

## Version History Summary

- **0.2.x**: Multi-workflow architecture and extensibility
- **0.1.x**: Core content creation features
- **0.0.x**: Initial development and testing
