---
name: Raspberry Pi image serving
description: Production image delivery on the Pi can fail inside Express sendFile even when the persisted JPEG exists.
---

The Pi image endpoint should read the verified JPEG file directly and send it as `image/jpeg`; the previous Express `sendFile` path returned 404 for an existing uploaded file on the Pi.

**Why:** The Pi logs showed successful uploads, a present image file, and repeated `sendFile` 404 responses. Direct file reads returned the image successfully in the same production-style setup.

**How to apply:** Preserve the direct-read image response when changing the card image route, and verify with an actual image request after rebuilding the API.

The Pi updater must also clear listeners on the configured frontend and API ports, because stale or missing PID files can leave the old API serving the previous image route while the rebuilt frontend fails to bind.

**Why:** The Pi had the new source and bundle but continued to log the old `sendFile` handler; the new frontend process also failed because port 5016 was already occupied.

**How to apply:** During installation or update, stop any listeners on the app-owned ports after PID-file cleanup and before starting rebuilt services.