import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'page', values: [{ name: 'page', value: '#f4f6f4' }] },
  },
};

export default preview;
