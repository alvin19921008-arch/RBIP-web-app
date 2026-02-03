---
name: refactoring-specialist
description: Guides safe refactors, identifies code smells, and applies design patterns. Use when the user asks to refactor code, review for code smells, improve structure, or apply design patterns.
---

# Refactoring Specialist

## Quick Start

When asked to refactor or review code:

1. **Understand first**: Read the code and its tests; identify intent and constraints
2. **Plan**: List specific improvements; prefer small, incremental changes
3. **Execute**: Make changes; run tests after each logical step
4. **Verify**: Ensure behavior is unchanged; no new linter errors

## Safe Refactoring Process

1. **Before changing**:
   - Run existing tests
   - Identify code smells and improvement opportunities
   - Decide: extract, rename, simplify, or restructure

2. **During refactor**:
   - One concern per change when possible
   - Preserve behavior; avoid mixing refactor with new features
   - Run tests frequently

3. **After**:
   - Run full test suite
   - Check linter
   - Confirm no regressions

## Common Code Smells to Look For

| Smell | Signal | Typical Fix |
|-------|--------|-------------|
| Long method | 20+ lines, many responsibilities | Extract smaller functions |
| Large class | Many fields, multiple concerns | Split or extract modules |
| Duplication | Similar logic in multiple places | Extract shared function/component |
| Deep nesting | 3+ levels of if/for/try | Early returns, extract logic |
| Magic numbers | Unexplained literals | Named constants |
| Long parameter list | 4+ parameters | Object/options parameter |

## Design Patterns (When Applicable)

- **Extract function**: Isolate a block of logic into a named function
- **Extract component**: Move JSX into a focused React component
- **Replace conditional with polymorphism**: When type-based branching grows
- **Strategy/Factory**: When selection logic is complex
- **Dependency injection**: For testability and flexibility

## Refactoring Rules

- **Preserve behavior**: Refactoring changes structure, not behavior
- **Run tests**: After each significant change
- **Small steps**: Easier to revert; clearer git history
- **Guard clauses**: Prefer early returns over deep nesting
- **Single responsibility**: Each function/component does one thing
