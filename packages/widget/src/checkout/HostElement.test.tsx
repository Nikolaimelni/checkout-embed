import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './HostElement.js';

let counter = 0;

/** A fresh tag per case: the registry is global and refuses to hear a name twice. */
function uniqueTag(): string {
  counter += 1;
  return `acme-button-${counter}`;
}

function define(tag: string): void {
  customElements.define(tag, class extends HTMLElement {});
}

describe('Button', () => {
  it('renders its own button when the merchant asked for nothing', () => {
    render(<Button onClick={vi.fn()}>Pay</Button>);

    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();
  });

  it('renders its own button when the tag is not registered', () => {
    render(
      <Button hostTag={uniqueTag()} onClick={vi.fn()}>
        Pay
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();
  });

  it('renders the host component when the tag is registered', () => {
    const tag = uniqueTag();
    define(tag);

    const { container } = render(
      <Button hostTag={tag} onClick={vi.fn()}>
        Pay
      </Button>,
    );

    expect(container.querySelector(tag)).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('picks the host component up when it is registered after we mounted', async () => {
    const tag = uniqueTag();
    const { container } = render(
      <Button hostTag={tag} onClick={vi.fn()}>
        Pay
      </Button>,
    );

    expect(container.querySelector(tag)).toBeNull();

    define(tag);
    await vi.waitFor(() => {
      expect(container.querySelector(tag)).not.toBeNull();
    });
  });

  it('still reports clicks through the host component', async () => {
    const tag = uniqueTag();
    define(tag);
    const onClick = vi.fn();

    const { container } = render(
      <Button hostTag={tag} onClick={onClick}>
        Pay
      </Button>,
    );
    await userEvent.click(container.querySelector(tag) as Element);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('leaves disabled off the host component rather than setting it to false', () => {
    const tag = uniqueTag();
    define(tag);

    const { container } = render(
      <Button hostTag={tag} disabled={false} onClick={vi.fn()}>
        Pay
      </Button>,
    );

    // disabled="false" is still disabled to an element that only checks for the attribute.
    expect(container.querySelector(tag)?.hasAttribute('disabled')).toBe(false);
  });

  it('does not call back from a disabled button', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Pay
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
