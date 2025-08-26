# Claude Code Subagents for MusicEZ

This directory contains custom Claude Code subagents designed specifically for the MusicEZ project to improve code quality, consistency, and architectural adherence.

## Custom Subagents

### enhanced-context-fetcher
**File**: `enhanced-context-fetcher.md`  
**Purpose**: Performs comprehensive architectural pattern analysis before task execution  
**Color**: Green  

**Key Features**:
- Analyzes database client patterns (centralized Prisma usage)
- Maps utility structures and import conventions  
- Validates against established code patterns
- Prevents common architectural mistakes
- Updates pattern documentation

**When to Use**: 
- At the beginning of any task execution (Step 2 in execute-tasks.md)
- When implementing new features that need architectural guidance
- Before making changes to established patterns

### self-improvement
**File**: `self-improvement.md`  
**Purpose**: Analyzes completed task execution for continuous learning and improvement  
**Color**: Purple  

**Key Features**:
- Reviews code quality and pattern adherence
- Identifies mistakes and successful approaches
- Updates knowledge base with learnings
- Documents anti-patterns to prevent future issues
- Suggests improvements to Agent OS instructions

**When to Use**:
- After completing any significant task (Step 8 in post-execution-tasks.md)
- When a task execution had issues or mistakes
- To maintain and improve the knowledge base

## Integration with Agent OS

These subagents are designed to work with the Agent OS workflow system:

### Execute-Tasks Integration
The `execute-tasks.md` instruction includes:
```xml
<step number="2" subagent="enhanced-context-fetcher" name="enhanced_context_analysis">
```

### Post-Execution Integration  
The `post-execution-tasks.md` instruction includes:
```xml
<step number="8" subagent="self-improvement" name="self_improvement_analysis">
```

## Usage Examples

### Using Enhanced Context-Fetcher
```
Use the enhanced-context-fetcher subagent to analyze architectural patterns for the MusicEZ project before implementing API key management features.
```

### Using Self-Improvement
```
Use the self-improvement subagent to analyze the API key controller implementation for quality, mistakes, and learning opportunities.
```

## Knowledge Base Integration

These subagents work with the following documentation files:

### Pattern Documentation
- `.agent-os/product/code-patterns.md` - Established architectural patterns
- `.agent-os/product/anti-patterns.md` - Patterns to avoid
- `.agent-os/product/tech-stack.md` - Technology standards

### Standards Documentation
- `.agent-os/standards/tech-stack.md` - Global tech stack defaults
- `.agent-os/standards/best-practices.md` - General best practices

## Benefits

### Architectural Consistency  
- Prevents database client mistakes (using centralized Prisma)
- Ensures correct import patterns and conventions
- Maintains established utility usage patterns

### Continuous Learning
- Each task execution improves future performance  
- Mistakes are documented to prevent recurrence
- Successful patterns are captured and codified

### Quality Improvement
- Code quality metrics improve over time
- Agent OS instructions evolve based on real experience
- Project-specific intelligence accumulates

## Troubleshooting

If subagents are not recognized by Claude Code:

1. **Check YAML Format**: Ensure frontmatter uses proper YAML syntax
2. **Verify File Location**: Subagents must be in `.claude/agents/` directory
3. **Restart Claude Code**: May need to restart to recognize new subagents
4. **Use Task Tool**: Can fallback to using Task tool with subagent_type parameter

## Development Notes

These subagents were created to address specific issues encountered during MusicEZ development:

- **Prisma Client Mistakes**: Enhanced context-fetcher prevents creating new PrismaClient instances
- **Import Convention Violations**: Ensures established patterns are followed  
- **Testing Pattern Inconsistencies**: Provides guidance on proper mocking strategies
- **Knowledge Loss**: Self-improvement captures learnings for future tasks

The goal is to create a self-improving development environment that gets smarter about the MusicEZ project with each task execution.