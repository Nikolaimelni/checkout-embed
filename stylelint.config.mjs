export default {
  extends: ['stylelint-config-standard-scss'],
  rules: {
    // The widget renders into a shadow root, so :host and ::slotted are normal
    // selectors here. The standard config has never heard of them.
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['host', 'host-context'] }],
    'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['slotted'] }],
  },
};
