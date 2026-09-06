---
'@checkout-embed/contracts': minor
'@checkout-embed/core': minor
'@checkout-embed/widget': minor
'@checkout-embed/sdk': minor
---

First public release. A script tag and three calls put a checkout on a page: the loader
queues anything called before the bundle lands, the widget renders into a shadow root the
host page cannot reach into, and the payment state machine runs in Node with no DOM at all.
