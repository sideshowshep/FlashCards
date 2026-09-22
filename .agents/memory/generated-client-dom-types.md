---
name: Generated client DOM types
description: The generated API client uses Headers.entries(), so its TypeScript lib must include DOM iterable types.
---

The shared API client TypeScript configuration must include both `dom` and `dom.iterable` libraries.

**Why:** Orval-generated fetch helpers call `Headers.entries()`, which is not present in the plain DOM lib and otherwise breaks the workspace library type check.

**How to apply:** Keep `dom.iterable` enabled for any workspace package that typechecks the generated browser client.