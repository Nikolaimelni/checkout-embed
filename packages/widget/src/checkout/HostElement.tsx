import { type ElementType, type ReactNode, useEffect, useState } from 'react';

function isDefined(name: string): boolean {
  return typeof customElements !== 'undefined' && customElements.get(name) !== undefined;
}

export function useHostElement(name: string | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() =>
    name !== undefined && isDefined(name) ? name : null,
  );

  useEffect(() => {
    if (name === undefined) {
      setResolved(null);
      return;
    }

    if (isDefined(name)) {
      setResolved(name);
      return;
    }

    setResolved(null);
    let live = true;
    void customElements.whenDefined(name).then(() => {
      if (live) setResolved(name);
    });

    return () => {
      live = false;
    };
  }, [name]);

  return resolved === name ? resolved : null;
}

type Props = {
  readonly hostTag?: string | undefined;
  readonly variant?: 'primary' | 'secondary';
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
};

export function Button({
  hostTag,
  variant = 'primary',
  disabled = false,
  onClick,
  children,
}: Props): ReactNode {
  const tag = useHostElement(hostTag);
  const className = variant === 'primary' ? 'button' : 'button secondary';

  if (tag !== null) {
    // why: the tag name comes from the merchant's config at runtime, not from JSX types
    const Host = tag as unknown as ElementType;

    // a custom element reads disabled="false" as disabled and ignores the attribute on click,
    // so the attribute is dropped when false and the handler goes when true
    return (
      <Host
        className={className}
        disabled={disabled || undefined}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
      >
        {children}
      </Host>
    );
  }

  return (
    <button className={className} type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
