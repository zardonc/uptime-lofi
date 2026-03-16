# Agent Commands, Constraints & Boundaries

## 1. Core Mandates

- **Banned Commands:** The use of `git restore`, `git stash`, `git checkout`, and `git worktree` is **absolutely prohibited** unless explicitly requested.
- **Refusal of Useless Output:** Provide solutions directly and execute them. Do not dump irrelevant documentation or propose unrelated follow-up tasks.
- **Debug-First Policy:** Never silently downgrade or swallow errors. Fully expose exceptions and logs to solve bugs at their root.
- **Dangerous Operations:** High-risk actions (deletions, bulk edits, DDL, etc.) require explicit user authorization via a standard warning template detailing impact and risk.
- **Execution Timeout:** Enforce a strict **60-second** hard timeout for backend unit tests to prevent task freezing.

---

## 2. Architectural & Code Standards

### Module & Logic
- **Module Syntax:** Use ES modules (`import`/`export`) and destructure imports.
- **Immutability (CRITICAL):** Always create new objects; never mutate existing ones. Prefer `readonly` and immutable data structures.
- **Dependency Injection:** Inject implementations via parameters or interfaces; avoid `new` in business logic.

### Code Complexity Hard Limits
> *Code exceeding these thresholds must be refactored immediately.*

| Metric                    | Limit                                                   |
| :------------------------ | :------------------------------------------------------ |
| **Function Length**       | Max 50 lines (excluding empty lines)                    |
| **File Size**             | 200–400 lines typical; Max 500 lines                    |
| **Nesting Depth**         | Max 3 levels (use early returns/guard clauses)          |
| **Parameters**            | Max 3 positional arguments (use Config/Options objects) |
| **Cyclomatic Complexity** | Max 10 per function                                     |
| **Constants**             | No magic numbers; extract to named constants            |

---

## 3. Security & Safety

- **Secrets:** Never hardcode API keys or passwords. Use environment variables and validate them at startup.
- **Leak Warning Exception:** Do not issue warnings for API keys provided in chat for debugging; only block them from source code.
- **Data Validation:** Validate all external inputs at system boundaries using schema-based validation.
- **Web Security:** Prevent SQL injection, XSS, and CSRF; implement rate limiting on all endpoints.

---

## 4. Development & Testing Workflow

- **Local Workflow:** 
  - Build: `pnpm run build`
  - Typecheck: `pnpm run typecheck`
  - *Cleanup:* Always terminate local services or processes after testing or calls to avoid conflicts and resource waste.
  - *Package Manager:* Prioritize `pnpm` commands in all scenarios. Downgrade to `npm` only if unresolvable exceptions occur during testing.
  - *Action:* Run linters/typecheckers after every change.
- **Git Workflow:** 
  - Format: `<type>: <description>`
  - PRs: Analyze history, draft summary, and include a test plan.
- **Testing Standard:** Write isolated, fast tests. Always write a **failing test** to reproduce a bug before fixing it.

## 5. Document Management Routing

You **MUST** proactively consult and strictly adhere to `@.adocs/rules/doc_management.md` during the following lifecycle events:

1. **Epic/Feature Initialization:** Before writing code for a new feature, read the rules to create a high-level plan document in the `@.adocs/plan/` directory.
2. **Task Breakdown:** Before implementing specific logic, break down the feature into atomic tasks and create corresponding task documents in the `@.adocs/tasks/` directory.
3. **Task Status Updates:** After completing a logical block of code, immediately update the corresponding task document's status and move it to the correct directory.

⚠️ **CRITICAL:** Never skip document updates. Your primary responsibility is ensuring the codebase state and document state remain 100% synchronized.

---

## 6. Execution Mechanics (Plan Mode)

### Standard Lifecycle
`Receive` -> `Gather Context` -> `Plan` -> `Execute` -> `Test/Reflect` -> `Deliver`

---

## 7. Advanced Tooling (MCP)
*Max 2 MCP calls per turn.*

- **Context7:** Primary source for library/framework APIs and SDK usage. Resolve library ID first.
- **fetch:** Retrieve webpages to Markdown. Fallback to raw URL if blocked.
- **server-memory:** Store architectural preferences across sessions.

---

## 8. Output Modes & Reflection

### Visual Structure
- Maintain empty lines around headers.
- Limit unordered lists to 5-7 items for readability.

### Execution Mode
- Clearly mark Phase 1-4.
- Use status markers: ✅ (Done), 🔄 (In Progress), ⏸ (Paused), ❌ (Failed).

### Self-Reflection Checklist (Pre-Flight)
1. [ ] Was the requirement restated and confirmed?
2. [ ] Was context gathering constrained to 5-8 tool calls?
3. [ ] Was a ≥2-step plan generated and tracked via TodoWrite?
4. [ ] Do modifications respect complexity hard limits?
5. [ ] Does delivery include `file:line` references and risks?
