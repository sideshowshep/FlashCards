---
name: Pi single-port production
description: Production topology for minimizing listener collisions on the Raspberry Pi.
---

The Raspberry Pi production runtime serves the built frontend and `/api` routes
from the same Express listener. Vite remains a development and Replit workflow
server, not a production dependency.

**Why:** The device hosts multiple webapps, so a second loopback API listener
adds avoidable collision and operational complexity even when it is not LAN
exposed.

**How to apply:** Keep the production launcher authoritative over one configured
port and static UI directory. Preserve separate Vite workflows only for
development; do not reintroduce an API proxy port into the Pi runtime.