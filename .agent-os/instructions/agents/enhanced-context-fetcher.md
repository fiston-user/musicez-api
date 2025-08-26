---
description: Enhanced Context-Fetcher Agent with Architectural Pattern Analysis
globs:
alwaysApply: false
version: 1.0
encoding: UTF-8
---

# Enhanced Context-Fetcher Agent

## Overview

An advanced context-fetcher agent that performs deep architectural pattern analysis to understand project-specific conventions, patterns, and architectural decisions. This agent prevents common mistakes by ensuring all agents understand established patterns like centralized database clients, utility structures, and import conventions.

## Core Responsibilities

1. **Architectural Pattern Discovery**: Identify established patterns in the codebase
2. **Code Convention Analysis**: Understand import/export patterns and file organization
3. **Database Pattern Recognition**: Find centralized database clients and connection patterns
4. **Utility Structure Mapping**: Identify shared utilities and helper functions
5. **Pattern Documentation**: Create and maintain documentation of discovered patterns
6. **Anti-Pattern Detection**: Identify what NOT to do based on code analysis

## Analysis Process

### Phase 1: Architectural Pattern Analysis

<step name="database_pattern_analysis">

#### Database Pattern Analysis
Analyze database connection and client patterns to understand how database access is managed.

<analysis_targets>
  <database_clients>
    - Look for centralized database clients (prisma.ts, db.ts, database.ts)
    - Identify singleton patterns for database connections
    - Find established import patterns for database access
  </database_clients>
  <connection_patterns>
    - Check for connection pooling strategies
    - Identify transaction management patterns
    - Find database configuration locations
  </connection_patterns>
</analysis_targets>

<search_patterns>
  <files_to_check>
    - src/database/*
    - src/db/*
    - src/utils/*database*
    - src/config/*database*
  </files_to_check>
  <import_patterns>
    - "import { prisma } from"
    - "import { db } from"
    - "new PrismaClient"
    - "createConnection"
  </import_patterns>
</search_patterns>

</step>

<step name="utility_structure_analysis">

#### Utility Structure Analysis
Map shared utilities, helpers, and common functionality patterns.

<utility_categories>
  <security_utils>
    - Authentication helpers
    - Encryption/hashing utilities
    - Token management
  </security_utils>
  <data_utils>
    - Validation helpers
    - Formatting utilities
    - Response formatters
  </data_utils>
  <service_utils>
    - External service clients
    - API helpers
    - Cache management
  </service_utils>
</utility_categories>

</step>

<step name="import_convention_analysis">

#### Import Convention Analysis
Understand how modules import dependencies and establish patterns.

<import_analysis>
  <relative_imports>
    - Analyze relative import patterns (../, ./)
    - Identify depth conventions
  </relative_imports>
  <absolute_imports>
    - Check for path aliases (@src, @utils, etc.)
    - Identify preferred import styles
  </absolute_imports>
  <dependency_patterns>
    - External vs internal import grouping
    - Import organization conventions
  </dependency_patterns>
</import_analysis>

</step>

### Phase 2: Pattern Validation and Documentation

<step name="pattern_validation">

#### Pattern Validation
Validate discovered patterns against existing standards and documentation.

<validation_checks>
  <standards_compliance>
    - Compare against .agent-os/standards/tech-stack.md
    - Validate against .agent-os/standards/best-practices.md
    - Check consistency with project documentation
  </standards_compliance>
  <consistency_analysis>
    - Ensure patterns are used consistently
    - Identify deviations and exceptions
    - Flag potential improvement areas
  </consistency_analysis>
</validation_checks>

</step>

<step name="pattern_documentation">

#### Pattern Documentation
Create and update documentation based on discovered patterns.

<documentation_targets>
  <code_patterns_file>
    - Update .agent-os/product/code-patterns.md
    - Document established architectural patterns
    - Include specific examples from codebase
  </code_patterns_file>
  <anti_patterns_file>
    - Update .agent-os/product/anti-patterns.md  
    - Document patterns to avoid
    - Include rationale for why patterns are problematic
  </anti_patterns_file>
</documentation_targets>

</step>

## Context Response Format

When providing context to other agents, use this structured format:

```markdown
## Architectural Context for [PROJECT_NAME]

### Database Patterns
- **Client Location**: [path/to/centralized/client]
- **Import Pattern**: [specific import statement to use]
- **Connection Type**: [singleton/pooled/etc]
- **Usage Example**: [code example]

### Utility Patterns
- **Security Utils**: [location and import patterns]
- **Data Formatters**: [location and import patterns]
- **Service Helpers**: [location and import patterns]

### Import Conventions
- **Relative Imports**: [when and how to use]
- **Absolute Imports**: [path aliases and conventions]
- **Dependency Organization**: [grouping and ordering rules]

### Established Anti-Patterns
- **Avoid**: [specific patterns to not use]
- **Reason**: [why these patterns are problematic]
- **Instead Use**: [correct alternative patterns]

### Project-Specific Requirements
- **Database Access**: [specific requirements for this project]
- **File Organization**: [established folder/file patterns]
- **Naming Conventions**: [variable, function, file naming rules]
```

## Usage Instructions

1. **Always run before task execution**: Use this agent during Step 2 of execute-tasks.md
2. **Update documentation**: Ensure code-patterns.md and anti-patterns.md are current
3. **Validate new implementations**: Check proposed code against established patterns
4. **Provide specific guidance**: Give concrete examples of correct patterns to use

## Integration Points

- **Execute-Tasks Step 2**: Replace basic context-fetcher with this enhanced version
- **Self-Improvement Agent**: Provides input for pattern improvement and anti-pattern identification
- **Code Generation**: All code generation should reference discovered patterns
- **Review Process**: Use patterns for code review and validation

## Success Criteria

- ✅ Database client patterns correctly identified and documented
- ✅ Import conventions clearly established and followed
- ✅ Utility structures mapped and accessible
- ✅ Anti-patterns documented with alternatives
- ✅ New code follows established patterns without manual correction
- ✅ Pattern documentation stays current with codebase evolution