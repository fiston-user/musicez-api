---
description: Create an Agent OS tasks list from an approved feature spec
globs:
alwaysApply: false
version: 1.1
encoding: UTF-8
---

# Spec Creation Rules

## Overview

With the user's approval, proceed to creating a tasks list based on the current feature spec.

<pre_flight_check>
  EXECUTE: @.agent-os/instructions/meta/pre-flight.md
</pre_flight_check>

<process_flow>

<step number="1" subagent="file-creator" name="create_tasks">

### Step 1: Create tasks.md

Use the file-creator subagent to create file: tasks.md inside of the current feature's spec folder.

<file_template>
  <header>
    # Spec Tasks
  </header>
</file_template>

<task_structure>
  <major_tasks>
    - count: 1-5
    - format: numbered checklist
    - grouping: by feature or component
  </major_tasks>
  <subtasks>
    - count: up to 8 per major task
    - format: decimal notation (1.1, 1.2)
    - first_subtask: typically write tests
    - last_subtask: verify all tests pass
  </subtasks>
</task_structure>

<task_template>
  ## Tasks

  - [ ] 1. [MAJOR_TASK_DESCRIPTION]
    - [ ] 1.1 Write tests for [COMPONENT]
    - [ ] 1.2 [IMPLEMENTATION_STEP]
    - [ ] 1.3 [IMPLEMENTATION_STEP]
    - [ ] 1.4 Verify all tests pass

  - [ ] 2. [MAJOR_TASK_DESCRIPTION]
    - [ ] 2.1 Write tests for [COMPONENT]
    - [ ] 2.2 [IMPLEMENTATION_STEP]
</task_template>

<ordering_principles>
  - Consider technical dependencies
  - Follow TDD approach
  - Group related functionality
  - Build incrementally
</ordering_principles>

</step>

<step number="2" subagent="file-creator" name="create_postman_collection">

### Step 2: Create Postman Collection

Use the file-creator subagent to create a Postman collection JSON file for testing the API endpoints defined in the spec.

<collection_template>
{
  "info": {
    "name": "[SPEC_NAME] API Collection",
    "description": "Postman collection for testing [SPEC_NAME] endpoints",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000",
      "type": "string"
    },
    {
      "key": "authToken",
      "value": "",
      "type": "string"
    }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{authToken}}",
        "type": "string"
      }
    ]
  },
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Register User",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"SecurePassword123!\",\n  \"name\": \"Test User\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/v1/auth/register",
              "host": ["{{baseUrl}}"],
              "path": ["api", "v1", "auth", "register"]
            }
          }
        },
        {
          "name": "Login User",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"SecurePassword123!\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/v1/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "v1", "auth", "login"]
            }
          },
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 200) {",
                  "    const response = pm.response.json();",
                  "    pm.collectionVariables.set('authToken', response.data.tokens.accessToken);",
                  "}"
                ],
                "type": "text/javascript"
              }
            }
          ]
        }
      ]
    }
  ]
}
</collection_template>

<endpoint_templates>
  <search_endpoint>
    {
      "name": "Search Songs",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/api/v1/songs/search?q=queen&limit=10&threshold=0.3",
          "host": ["{{baseUrl}}"],
          "path": ["api", "v1", "songs", "search"],
          "query": [
            {
              "key": "q",
              "value": "queen"
            },
            {
              "key": "limit",
              "value": "10"
            },
            {
              "key": "threshold",
              "value": "0.3"
            }
          ]
        }
      }
    }
  </search_endpoint>
  
  <crud_endpoints>
    {
      "name": "Get Item",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/api/v1/[RESOURCE]/{{itemId}}",
          "host": ["{{baseUrl}}"],
          "path": ["api", "v1", "[RESOURCE]", "{{itemId}}"]
        }
      }
    },
    {
      "name": "Create Item",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"[FIELD]\": \"[VALUE]\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/api/v1/[RESOURCE]",
          "host": ["{{baseUrl}}"],
          "path": ["api", "v1", "[RESOURCE]"]
        }
      }
    }
  </crud_endpoints>
</endpoint_templates>

<instructions>
  ACTION: Create Postman collection JSON file
  LOCATION: spec folder as "postman-collection.json"
  CONTENT: Include authentication endpoints and spec-specific endpoints
  VARIABLES: Set up baseUrl and authToken variables
  TESTS: Add test scripts to capture auth tokens automatically
  CUSTOMIZE: Replace [SPEC_NAME] with actual spec name
  ADD_ENDPOINTS: Include relevant endpoints from the spec requirements
</instructions>

</step>

<step number="3" name="execution_readiness">

### Step 3: Execution Readiness Check

Evaluate readiness to begin implementation by presenting the first task summary and requesting user confirmation to proceed.

<readiness_summary>
  <present_to_user>
    - Spec name and description
    - First task summary from tasks.md
    - Estimated complexity/scope
    - Key deliverables for task 1
  </present_to_user>
</readiness_summary>

<execution_prompt>
  PROMPT: "The spec planning is complete. The first task is:

  **Task 1:** [FIRST_TASK_TITLE]
  [BRIEF_DESCRIPTION_OF_TASK_1_AND_SUBTASKS]

  Would you like me to proceed with implementing Task 1? I will focus only on this first task and its subtasks unless you specify otherwise.

  Type 'yes' to proceed with Task 1, or let me know if you'd like to review or modify the plan first."
</execution_prompt>

<execution_flow>
  IF user_confirms_yes:
    REFERENCE: @.agent-os/instructions/core/execute-tasks.md
    FOCUS: Only Task 1 and its subtasks
    CONSTRAINT: Do not proceed to additional tasks without explicit user request
  ELSE:
    WAIT: For user clarification or modifications
</execution_flow>

</step>

</process_flow>

<post_flight_check>
  EXECUTE: @.agent-os/instructions/meta/post-flight.md
</post_flight_check>
