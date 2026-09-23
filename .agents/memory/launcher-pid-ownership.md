---
name: Launcher PID ownership
description: How a local foreground launcher should recognize its own supervisor safely.
---

Managed-process ownership checks must combine the expected application working
directory with either the absolute launcher path or a relative launcher command
such as `./install.sh`.

**Why:** A shell may start the same launcher with a relative path. Checking only
the absolute path makes a valid supervisor look foreign and prevents safe
status, restart, and stop operations.

**How to apply:** Keep the working-directory check mandatory, then accept the
known launcher basename only when it appears as the executable script argument.