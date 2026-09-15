# ADR-001 — NestJS as Primary Backend

Status: Accepted

Date: 2026-09-06

## Context

The Laboratory needs a production API foundation that supports incremental
learning in architecture and system design while staying understandable and
testable. This backend choice is explicitly required for V0.1-001.

## Decision

Use Node.js + TypeScript + NestJS as the primary application backend.

NestJS provides modular architecture, dependency injection, strong TypeScript
support, and testability. It suits production APIs and future requirements for
queues, events, WebSockets, and integrations. Its explicit application structure
aligns with the Laboratory's system-design learning goals.

## Alternatives considered

- FastAPI: strong fit for Python-centric services, but would introduce a different
  primary language and runtime from the chosen TypeScript foundation.
- Express: a smaller framework with more manual choices for module boundaries,
  dependency injection, and consistent application structure.
- Next.js-only backend: useful for integrated web applications, but this project
  currently needs an independent API and has no frontend requirement.

## Consequences

Start with one NestJS application module and add modules when requirements justify
them. Accept framework conventions and decorator metadata in exchange for
consistent structure and dependency injection. Future platform capabilities are
not authorization to add infrastructure now.

Python may be introduced later if a real requirement justifies a specialized
AI/ML service; it is not part of V0.1-001.
