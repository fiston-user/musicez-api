---
description: Rules to initiate execution of a set of tasks using Agent OS
globs:
alwaysApply: false
version: 1.0
encoding: UTF-8
---

# Task Execution Rules

## Overview

Execute tasks for a given spec following three distinct phases:
1. Pre-execution setup (Steps 1-3)
2. Task execution loop (Step 4)
3. Post-execution tasks (Step 5)

**IMPORTANT**: All three phases MUST be completed. Do not stop after phase 2.

<pre_flight_check>
  EXECUTE: @.agent-os/instructions/meta/pre-flight.md
</pre_flight_check>

<process_flow>

## Phase 1: Pre-Execution Setup

<step number="1" name="task_assignment">

### Step 1: Task Assignment

Identify which tasks to execute from the spec (using spec_srd_reference file path and optional specific_tasks array), defaulting to the next uncompleted parent task if not specified.

<task_selection>
  <explicit>user specifies exact task(s)</explicit>
  <implicit>find next uncompleted task in tasks.md</implicit>
</task_selection>

<instructions>
  ACTION: Identify task(s) to execute
  DEFAULT: Select next uncompleted parent task if not specified
  CONFIRM: Task selection with user
</instructions>

</step>

<step number="2" subagent="enhanced-context-fetcher" name="enhanced_context_analysis">

### Step 2: Enhanced Context Analysis

Use the enhanced-context-fetcher subagent to perform comprehensive architectural pattern analysis and gather context for task understanding. This includes architectural patterns, code conventions, database patterns, and anti-pattern awareness.

<instructions>
  ACTION: Use enhanced-context-fetcher subagent (Claude Code subagent in .claude/agents/)
  REQUEST: Perform comprehensive context analysis for task execution including:
    - Analyze architectural patterns (database clients, utilities, imports)
    - Load essential documentation (tasks.md, mission-lite.md, spec-lite.md, technical-spec.md)
    - Review established code patterns from code-patterns.md
    - Check anti-patterns to avoid from anti-patterns.md
    - Generate architectural context summary for task execution
  WAIT: For enhanced context analysis completion
  PROCESS: Use architectural guidance for all subsequent task implementation
</instructions>

<enhanced_context_gathering>
  <architectural_analysis>
    - Database client patterns (singleton usage, import patterns)
    - Utility structure mapping (security, formatters, helpers)
    - Import convention analysis (relative vs absolute, organization)
    - File organization patterns (controllers, routes, tests)
  </architectural_analysis>
  <essential_docs>
    - tasks.md for task breakdown
    - code-patterns.md for established patterns
    - anti-patterns.md for patterns to avoid
  </essential_docs>
  <conditional_docs>
    - mission-lite.md for product alignment
    - spec-lite.md for feature summary
    - technical-spec.md for implementation details
    - tech-stack.md for technology standards
  </conditional_docs>
  <pattern_validation>
    - Verify proposed implementations against established patterns
    - Ensure import conventions are followed
    - Check database access patterns match project standards
    - Validate against documented anti-patterns
  </pattern_validation>
</enhanced_context_gathering>

<architectural_guidance>
  The enhanced context-fetcher will provide specific guidance including:
  - Correct database client import patterns
  - Established utility locations and usage
  - Proper import organization and conventions
  - Testing patterns and mock setups
  - Error handling and logging standards
  - Response formatting approaches
</architectural_guidance>

</step>

<step number="3" subagent="git-workflow" name="git_branch_management">

### Step 3: Git Branch Management

Use the git-workflow subagent to manage git branches to ensure proper isolation by creating or switching to the appropriate branch for the spec.

<instructions>
  ACTION: Use git-workflow subagent
  REQUEST: "Check and manage branch for spec: [SPEC_FOLDER]
            - Create branch if needed
            - Switch to correct branch
            - Handle any uncommitted changes"
  WAIT: For branch setup completion
</instructions>

<branch_naming>
  <source>spec folder name</source>
  <format>exclude date prefix</format>
  <example>
    - folder: 2025-03-15-password-reset
    - branch: password-reset
  </example>
</branch_naming>

</step>

## Phase 2: Task Execution Loop

<step number="4" name="task_execution_loop">

### Step 4: Task Execution Loop

**IMPORTANT**: This is a loop. Execute ALL assigned tasks before proceeding to Phase 3.

Execute all assigned parent tasks and their subtasks using @.agent-os/instructions/core/execute-task.md instructions, continuing until all tasks are complete.

<execution_flow>
  LOAD @.agent-os/instructions/core/execute-task.md ONCE

  FOR each parent_task assigned in Step 1:
    EXECUTE instructions from execute-task.md with:
      - parent_task_number
      - all associated subtasks
    WAIT for task completion
    UPDATE tasks.md status
  END FOR

  **IMPORTANT**: After loop completes, CONTINUE to Phase 3 (Step 5). Do not stop here.
</execution_flow>

<loop_logic>
  <continue_conditions>
    - More unfinished parent tasks exist
    - User has not requested stop
  </continue_conditions>
  <exit_conditions>
    - All assigned tasks marked complete
    - User requests early termination
    - Blocking issue prevents continuation
  </exit_conditions>
</loop_logic>

<task_status_check>
  AFTER each task execution:
    CHECK tasks.md for remaining tasks
    IF all assigned tasks complete:
      PROCEED to next step
    ELSE:
      CONTINUE with next task
</task_status_check>

<instructions>
  ACTION: Load execute-task.md instructions once at start
  REUSE: Same instructions for each parent task iteration
  LOOP: Through all assigned parent tasks
  UPDATE: Task status after each completion
  VERIFY: All tasks complete before proceeding
  HANDLE: Blocking issues appropriately
  **IMPORTANT**: When all tasks complete, proceed to Step 5
</instructions>

</step>

## Phase 3: Post-Execution Tasks

<step number="5" name="post_execution_tasks">

### Step 5: Run the task completion steps

**CRITICAL**: This step MUST be executed after all tasks are implemented. Do not end the process without completing this phase.

After all tasks in tasks.md have been implemented, use @.agent-os/instructions/core/post-execution-tasks.md to run our series of steps we always run when finishing and delivering a new feature.

<instructions>
  LOAD: @.agent-os/instructions/core/post-execution-tasks.md once
  ACTION: execute all steps in the post-execution-tasks.md process_flow.
  **IMPORTANT**: This includes:
    - Running full test suite
    - Git workflow (commit, push, PR)
    - Verifying task completion
    - Updating roadmap (if applicable)
    - Creating recap document
    - Generating completion summary
    - Playing notification sound
</instructions>

</step>

</process_flow>

<post_flight_check>
  EXECUTE: @.agent-os/instructions/meta/post-flight.md
</post_flight_check>
