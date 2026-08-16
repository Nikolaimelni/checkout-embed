import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  addons: [],
  // A portfolio repo should not phone home on somebody else's machine.
  core: { disableTelemetry: true },
};

export default config;
