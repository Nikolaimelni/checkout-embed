# @checkout-embed/widget

## 0.1.0

### Minor Changes

- 81e6188: First public release. A script tag and three calls put a checkout on a page: the loader
  queues anything called before the bundle lands, the widget renders into a shadow root the
  host page cannot reach into, and the payment state machine runs in Node with no DOM at all.

### Patch Changes

- Updated dependencies [81e6188]
  - @checkout-embed/contracts@0.1.0
  - @checkout-embed/core@0.1.0
