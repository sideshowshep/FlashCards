---
name: iOS playback image readiness
description: Playback behavior that keeps the first card visible on iOS while preserving image/title synchronization.
---

The playback preparation image must remain rendered, even when visually transparent; iOS may defer or skip image loading for `display: none` elements. Image and title visibility must be gated by a readiness key containing both the card identity and the playback transition, not by a standalone counter.

**Why:** A blank first playback screen occurred when the preparation image did not reliably fire its load event and when readiness could be associated with a stale transition token. The image/title pairing guard itself must remain in place.

**How to apply:** When changing playback startup or swipe transitions, keep the preparation image in layout with zero visual impact and update the shared readiness key only from a successful image load or a confirmed complete image for the current card transition.