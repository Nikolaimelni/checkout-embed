import { CheckoutView } from '@checkout-embed/widget';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { STATES, TOTAL } from '../fixtures';

const meta = {
  title: 'Checkout/View',
  component: CheckoutView,
  args: {
    total: TOTAL,
    locale: 'en-GB',
    onIntent: () => {},
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CheckoutView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = { args: { state: STATES.idle } };

export const ChoosingAMethod: Story = { args: { state: STATES.methods } };

export const Details: Story = { args: { state: STATES.details } };

export const Confirming: Story = { args: { state: STATES.confirming } };

export const Challenge: Story = { args: { state: STATES.requiresAction } };

export const Polling: Story = { args: { state: STATES.polling } };

export const Succeeded: Story = { args: { state: STATES.succeeded } };

export const Failed: Story = { args: { state: STATES.failed } };

export const FailedForGood: Story = { args: { state: STATES.failedFinal } };

export const WithAHostButton: Story = {
  args: { state: STATES.details, components: { button: 'acme-button' } },
  loaders: [
    () => {
      if (!customElements.get('acme-button')) {
        customElements.define(
          'acme-button',
          class extends HTMLElement {
            connectedCallback() {
              this.style.cssText =
                'display:inline-block;padding:10px 18px;border:2px dashed #7a3ea1;color:#7a3ea1;cursor:pointer;font:inherit';
            }
          },
        );
      }
      return {};
    },
  ],
};
