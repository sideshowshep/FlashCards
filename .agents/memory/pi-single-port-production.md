---
name: Pi single-port production
description: Production topology for minimizing listener collisions on the Raspberry Pi.
---

The Raspberry Pi production runtime serves the built frontend and `/api` routes
from the same Express listener. Vite remains a development and Replit workflow
server, not a production dependency. The supported reboot path is the generated
`picture-flashcards.service` systemd unit.

**Why:** The device hosts multiple webapps, so a second loopback API listener
adds avoidable collision and operational complexity even when it is not LAN
exposed. Systemd provides boot startup and failure restart without adding a
custom resident supervisor.

**How to apply:** Keep the production launcher authoritative over one configured
port and static UI directory. Use `--install-service` on the Pi to generate,
enable, and start the unit; preserve separate Vite workflows only for
development and do not reintroduce an API proxy port into the Pi runtime.