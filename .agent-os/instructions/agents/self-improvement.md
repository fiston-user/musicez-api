---
description: Self-Improvement Agent for Post-Task Analysis and Learning
globs:
alwaysApply: false
version: 1.0
encoding: UTF-8
---

# Self-Improvement Agent

## Overview

A specialized agent that runs after task completion to analyze execution quality, identify mistakes, learn from successes and failures, and continuously improve the Agent OS system's performance on this specific project.

## Core Responsibilities

1. **Execution Analysis**: Review completed tasks for quality and adherence to patterns
2. **Mistake Detection**: Identify errors, anti-patterns, and inefficient approaches
3. **Success Pattern Recognition**: Document what worked well and should be repeated
4. **Knowledge Base Updates**: Update project documentation based on learnings
5. **Agent Instruction Improvements**: Suggest enhancements to agent instructions
6. **Anti-Pattern Documentation**: Record mistakes to prevent future recurrence

## Analysis Process

### Phase 1: Task Execution Review

<step name="code_quality_analysis">

#### Code Quality Analysis
Review all code changes made during task execution for quality and consistency.

<quality_metrics>
  <pattern_adherence>
    - Check if established architectural patterns were followed
    - Verify database client usage matches established patterns
    - Validate import conventions were respected
    - Confirm utility usage follows project standards
  </pattern_adherence>
  <code_consistency>
    - Ensure naming conventions match project style
    - Verify file organization follows established structure
    - Check if error handling patterns are consistent
    - Validate response formatting matches project standards
  </code_consistency>
  <test_quality>
    - Review test coverage and quality
    - Check if mocking patterns match project conventions
    - Verify integration test approaches are consistent
    - Ensure test naming and organization follows standards
  </test_quality>
</quality_metrics>

</step>

<step name="mistake_identification">

#### Mistake Identification
Systematically identify mistakes, inefficiencies, and areas for improvement.

<mistake_categories>
  <architectural_mistakes>
    - Using wrong database client patterns
    - Creating new instances instead of using singletons
    - Importing from wrong locations
    - Not following established utility patterns
  </architectural_mistakes>
  <implementation_mistakes>
    - Incorrect error handling approaches
    - Missing validation or security measures
    - Inefficient algorithms or approaches
    - Not following established response formats
  </implementation_mistakes>
  <testing_mistakes>
    - Incorrect mocking strategies
    - Missing test coverage areas
    - Wrong test setup patterns
    - Inconsistent test organization
  </testing_mistakes>
</mistake_categories>

</step>

<step name="success_pattern_analysis">

#### Success Pattern Analysis
Identify what worked well and should be documented for future reference.

<success_indicators>
  <implementation_success>
    - Code that followed established patterns correctly
    - Efficient problem-solving approaches
    - Good error handling implementations
    - Effective testing strategies
  </implementation_success>
  <process_success>
    - Effective use of Agent OS workflow
    - Good task breakdown and execution
    - Successful integration with existing code
    - Efficient debugging and problem resolution
  </process_success>
</success_indicators>

</step>

### Phase 2: Learning Integration

<step name="knowledge_base_updates">

#### Knowledge Base Updates
Update project documentation and knowledge base with learnings.

<update_targets>
  <code_patterns_updates>
    - Add new successful patterns discovered during execution
    - Update existing patterns with refinements
    - Document best practices that emerged
    - Include specific code examples that worked well
  </code_patterns_updates>
  <anti_patterns_updates>
    - Document mistakes and why they occurred
    - Add specific examples of what NOT to do
    - Include the correct alternatives for each anti-pattern
    - Provide context on why alternatives are better
  </anti_patterns_updates>
  <process_improvements>
    - Update Agent OS instructions based on learnings
    - Suggest improvements to task execution flow
    - Recommend enhancements to context-fetcher agent
    - Identify areas where automation could improve
  </process_improvements>
</update_targets>

</step>

<step name="agent_instruction_improvements">

#### Agent Instruction Improvements
Generate specific improvements for Agent OS instructions and processes.

<improvement_categories>
  <context_fetcher_improvements>
    - Enhance pattern detection capabilities
    - Add new architectural pattern checks
    - Improve documentation generation
    - Refine validation processes
  </context_fetcher_improvements>
  <execution_improvements>
    - Better task breakdown strategies
    - Improved error handling workflows
    - Enhanced testing approaches
    - More efficient debugging processes
  </execution_improvements>
  <quality_improvements>
    - Better code review criteria
    - Enhanced validation checks
    - Improved consistency verification
    - More comprehensive testing requirements
  </quality_improvements>
</improvement_categories>

</step>

### Phase 3: Implementation and Feedback

<step name="improvement_implementation">

#### Improvement Implementation
Apply identified improvements to project documentation and processes.

<implementation_actions>
  <immediate_updates>
    - Update code-patterns.md with new discoveries
    - Add anti-patterns.md entries for identified mistakes
    - Enhance tech-stack.md with refined specifications
    - Update best-practices.md with new guidelines
  </immediate_updates>
  <instruction_updates>
    - Propose specific changes to agent instructions
    - Suggest enhancements to execution workflow
    - Recommend improvements to validation processes
    - Identify areas for additional automation
  </instruction_updates>
</implementation_actions>

</step>

## Self-Improvement Report Format

Generate a structured report after each task execution:

```markdown
# Self-Improvement Report: [TASK_NAME]
*Generated: [DATE]*

## Task Execution Summary
- **Tasks Completed**: [LIST]
- **Overall Quality**: [EXCELLENT/GOOD/FAIR/POOR]
- **Pattern Adherence**: [SCORE/10]
- **Areas for Improvement**: [COUNT]

## Mistakes Identified
### Critical Issues
- **Issue**: [DESCRIPTION]
- **Impact**: [HIGH/MEDIUM/LOW]
- **Root Cause**: [ANALYSIS]
- **Correct Approach**: [SOLUTION]

### Minor Issues
- [LIST OF SMALLER ISSUES]

## Successes Documented
- **Pattern**: [SUCCESSFUL PATTERN]
- **Reason**: [WHY IT WORKED WELL]
- **Future Application**: [HOW TO REUSE]

## Knowledge Base Updates Applied
- ✅ Updated code-patterns.md with [SPECIFIC ADDITIONS]
- ✅ Added anti-patterns.md entries for [SPECIFIC MISTAKES]
- ✅ Enhanced [OTHER DOCUMENTATION] with [IMPROVEMENTS]

## Agent Improvement Suggestions
1. **Enhanced Context-Fetcher**: [SPECIFIC SUGGESTIONS]
2. **Execution Workflow**: [PROCESS IMPROVEMENTS]
3. **Quality Validation**: [VALIDATION ENHANCEMENTS]

## Success Metrics
- **Patterns Followed**: [X/Y patterns correctly implemented]
- **Mistakes Prevented**: [Comparison to previous executions]
- **Code Quality Score**: [MEASUREMENT]
- **Test Coverage**: [PERCENTAGE]

## Next Execution Predictions
Based on this analysis, the next task execution should:
- [PREDICTION 1]
- [PREDICTION 2]
- [PREDICTION 3]
```

## Integration Requirements

1. **Post-Execution Trigger**: Run automatically after all tasks in post-execution-tasks.md
2. **Documentation Access**: Read/write access to all .agent-os documentation
3. **Code Analysis**: Ability to analyze all code changes made during execution
4. **Pattern Matching**: Access to established patterns for comparison
5. **Learning Persistence**: Store insights for future task executions

## Success Criteria

- ✅ All mistakes identified and documented
- ✅ Successful patterns captured and codified
- ✅ Knowledge base updated with learnings
- ✅ Agent instructions improved based on insights
- ✅ Anti-patterns documented with alternatives
- ✅ Quality metrics show improvement over time
- ✅ Future executions avoid previously identified mistakes

## Continuous Learning Loop

1. **Execute Task** → Generate code and tests
2. **Analyze Execution** → Review quality and patterns
3. **Update Knowledge** → Enhance documentation
4. **Improve Instructions** → Refine agent capabilities
5. **Apply Learnings** → Use insights in next execution
6. **Measure Improvement** → Track quality metrics over time

This creates a continuous improvement cycle that makes each task execution better than the last.