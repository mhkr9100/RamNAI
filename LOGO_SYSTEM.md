# Workspace Logo & Icon System

This document tracks the correct icons for key brand elements within the application to prevent displacement and ensure consistency.

## 1. Workspace (Main Brand)
- **Component:** `AppLogo`
- **File:** `components/icons/AppLogo.tsx`
- **Usage:** Used for the main app logo, navigation bar, and general branding.

## 2. Coordinator (The Meta Agent)
- **Component:** `CoordinatorIcon`
- **File:** `components/icons/CoordinatorIcon.tsx`
- **Usage:** Specifically represents the "Coordinator" Meta Agent brain and individual Coordinator-specific UI elements.

## 3. The Directory (Management Layer)
- **Component:** `DirectoryIcon`
- **File:** `components/icons/DirectoryIcon.tsx`
- **Usage:** Represents the agent management workspace and tool orchestration.

## 4. UserMap (Context Memory)
- **Component:** `UserMapIcon`
- **File:** `components/icons/UserMapIcon.tsx`
- **Usage:** Represents the long-term memory and context extraction engine.

---

**CRITICAL RULE:** Do not use `CoordinatorIcon` when representing `Workspace` generally. Always use `AppLogo` for the product brand.
