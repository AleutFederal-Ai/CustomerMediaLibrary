# AGENTS.md

## Product standard
Build enterprise-hardened, user-friendly, production-ready applications.

## Core principles
- Fix root causes, not symptoms.
- Do not use bandaid fixes, hacks, or temporary patches unless explicitly approved as a short-term emergency mitigation.
- Prefer secure, maintainable, well-understood solutions over clever shortcuts.
- Make decisions that support both operational resilience and ease of use.

## Requirements clarity
- Do not guess or assume missing requirements.
- If requirements, constraints, dependencies, or context are unclear, ask clarifying questions before proceeding.
- State assumptions explicitly when proceeding with incomplete information.
- Confirm understanding of the request, scope, and expected outcome before making material changes.

## Change impact discipline
- Before making changes, evaluate and explain potential impacts to:
  - existing functionality
  - downstream systems
  - integrations and interfaces
  - data integrity
  - security and permissions
  - performance and scalability
  - supportability and operations
- Avoid changes that introduce regressions or unintended side effects.
- Prefer incremental, controlled changes over broad, risky rewrites unless a rewrite is clearly justified.
- If a requested approach is weak, risky, or conflicts with these standards, call it out and propose a better alternative.

## Architecture requirements
- Every application must include an admin portal unless explicitly told otherwise.
- The admin portal must support configuration, user and role management where applicable, operational visibility, and audit-friendly administrative controls.
- Build modular, maintainable architectures with clear separation of concerns.
- Design for least privilege and role-based access control.
- Favor configurable systems over hardcoded behavior.

## Configuration requirements
- Never hardcode secrets, credentials, tokens, tenant-specific settings, environment-specific values, URLs, IDs, role mappings, business rules, or feature flags.
- Externalize configuration through environment variables, configuration files, or admin-controlled settings.
- Use safe defaults and document all required configuration.
- Treat hardcoding as a defect unless there is a strong documented reason.

## Testing requirements
- Automated testing is required.
- Do not ship untested code.
- Include automated tests for critical workflows, authentication, authorization, validation, business logic, and failure paths.
- Add integration tests for core end-to-end flows where applicable.
- Add regression tests for defects that are fixed.
- Do not claim a fix is complete without identifying the tests that validate it.

## Logging and observability requirements
- Use heavy, structured logging for application flow, errors, warnings, security-relevant events, and administrative actions.
- Include enough detail to support troubleshooting, production operations, and audit review.
- Use consistent event names and metadata.
- Include correlation IDs, request IDs, tenant context, and actor context where appropriate.
- Never log secrets, credentials, tokens, or sensitive personal data.
- Make production issues diagnosable without requiring code changes.

## Security requirements
- Prefer secure-by-default implementations.
- Validate all inputs on both client and server as appropriate.
- Enforce authentication, authorization, and least-privilege access consistently.
- Protect sensitive data in transit and at rest.
- Minimize attack surface and unnecessary dependencies.
- Handle errors safely without exposing internals to end users.

## UX and design requirements
- All applications must be responsive by default across desktop, tablet, and mobile.
- Interfaces must be clear, accessible, intuitive, and suitable for non-technical users.
- Use plain language, predictable navigation, and clear calls to action.
- Provide polished loading, empty, success, and error states.
- Validation must be specific, actionable, and user-friendly.
- Optimize for common tasks first and reduce unnecessary clicks and cognitive load.

## Documentation requirements
- Always update relevant documentation when making changes.
- Documentation must remain synchronized with implementation at all times.
- Update documentation for:
  - configuration changes
  - environment variables
  - new dependencies
  - setup steps
  - API or interface changes
  - schema or data model changes
  - operational or deployment impacts
  - admin portal behavior
  - testing expectations
- Do not leave outdated, incomplete, or misleading documentation.

## Code quality requirements
- Use readable, maintainable, production-grade implementations.
- Avoid dead code, commented-out code, misleading TODOs, and placeholder logic presented as complete work.
- Keep modules focused and responsibilities clear.
- Prefer explicitness over hidden behavior.
- Document important tradeoffs and risks.

## Expected behavior when generating code or plans
For every meaningful implementation or proposed change:
1. Explain the root cause being addressed.
2. Identify assumptions and open questions.
3. Explain impact on existing systems and functionality.
4. Describe security implications.
5. Describe logging and observability coverage.
6. Identify what is configurable instead of hardcoded.
7. Identify required automated tests.
8. Identify documentation that must be updated.
9. Explain how the solution supports responsive and user-friendly behavior.
10. Call out remaining risks, gaps, or follow-up work.
