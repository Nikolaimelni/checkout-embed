import { type ElementType, type ReactNode, useEffect, useState } from 'react';

function isDefined(name: string): boolean {
  return typeof customElements !== 'undefined' && customElements.get(name) !== undefined;
}

/**
 * Returns the tag name once the host has actually registered it, and null until then. A
 * merchant on a lazily hydrated page registers their components after our script runs
 * more often than before it, so a single synchronous check would fall back forever.
 *
 * The name arrives from a parsed config, which is where it is checked against the rules
 * the custom element registry enforces by throwing.
 */
export function useHostElement(name: string | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() =>
    name !== undefined && isDefined(name) ? name : null,
  );

  // Syncs with the custom element registry, which lives outside React and can gain the
  // tag at any moment.
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

    // An absent attribute rather than disabled="false", which a custom element would read
    // as disabled.
    return (
      <Host className={className} disabled={disabled || undefined} onClick={onClick}>
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
