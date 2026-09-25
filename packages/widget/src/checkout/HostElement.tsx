import { type ElementType, type ReactNode, useEffect, useState } from 'react';

function isDefined(name: string): boolean {
  return typeof customElements !== 'undefined' && customElements.get(name) !== undefined;
}

/** The tag name once the host has registered it, null until then. Lazily hydrated pages
 * register late, so this waits instead of checking once. */
export function useHostElement(name: string | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() =>
    name !== undefined && isDefined(name) ? name : null,
  );

  // Syncs with the custom element registry, which can gain the tag at any moment.
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
    // why: the tag name is a runtime string from the merchant's config, so there is no
    // union of literal element names for TypeScript to check it against.
    const Host = tag as unknown as ElementType;

    // No disabled="false", which a custom element reads as disabled, and no handler, since a
    // custom element ignores the attribute when clicked.
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
