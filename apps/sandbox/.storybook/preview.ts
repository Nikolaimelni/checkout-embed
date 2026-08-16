import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    // The widget carries its own stylesheet into a shadow root, so a Storybook theme has
    // nothing to say about it. The background is here to show the widget's own edges.
    backgrounds: { default: 'page', values: [{ name: 'page', value: '#f4f6f4' }] },
  },
};

export default preview;
