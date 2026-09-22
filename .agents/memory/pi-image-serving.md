---
name: Raspberry Pi image serving
description: Production image delivery on the Pi can fail inside Express sendFile even when the persisted JPEG exists.
---

The Pi image endpoint should read the verified JPEG file directly and send it as `image/jpeg`; the previous Express `sendFile` path returned 404 for an existing uploaded file on the Pi.

**Why:** The Pi logs showed successful uploads, a present image file, and repeated `sendFile` 404 responses. Direct file reads returned the image successfully in the same production-style setup.

**How to apply:** Preserve the direct-read image response when changing the card image route, and verify with an actual image request after rebuilding the API.