import { FocusScope } from '@react-aria/focus';
import { type ReactNode, useEffect, useRef } from 'react';
import { boolean, literal, object, string } from 'zod';
import { Button } from './HostElement.js';
import type { Labels } from './labels.js';

/**
 * What the mock provider's challenge page posts when somebody finishes with it. A real
 * provider defines its own shape and an integration adapts to that one; the important
 * part is that whatever arrives is checked against a schema and an origin before it is
 * allowed to move a payment along.
 *
 * It is a hint either way. The status still comes from polling the provider, because a
 * message from an iframe is not a receipt.
 */
const ChallengeResultSchema = object({
  source: literal('checkout-embed-3ds'),
  intentId: string().min(1),
  approved: boolean(),
});

type Props = {
  readonly actionUrl: string;
  readonly intentId: string;
  readonly labels: Labels;
  readonly hostButtonTag?: string | undefined;
  readonly onFinished: () => void;
};

export function Challenge({
  actionUrl,
  intentId,
  labels,
  hostButtonTag,
  onFinished,
}: Props): ReactNode {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Syncs with the DOM focus ring. React Aria autoFocus walks out from
  // document.activeElement, which for a shadow root is the host element rather than
  // anything inside, so opening the dialog leaves focus where it was. Moving it to the
  // dialog itself also gets its label read out before the iframe takes over.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Syncs with the challenge iframe, a document on the provider's origin that posts a
  // message when somebody finishes with it.
  useEffect(() => {
    const expectedOrigin = new URL(actionUrl).origin;

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== expectedOrigin) return;

      const result = ChallengeResultSchema.safeParse(event.data);
      if (!result.success || result.data.intentId !== intentId) return;

      onFinished();
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [actionUrl, intentId, onFinished]);

  return (
    <div className="overlay">
      <FocusScope contain restoreFocus>
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-label={labels.challengeTitle}
          tabIndex={-1}
          ref={dialogRef}
        >
          <div className="challenge">
            <h2 className="heading">{labels.challengeTitle}</h2>
            <p className="status">{labels.challengeHint}</p>
            <iframe className="challenge-frame" src={actionUrl} title={labels.challengeTitle} />
            <div className="actions">
              <Button hostTag={hostButtonTag} variant="secondary" onClick={onFinished}>
                {labels.challengeDone}
              </Button>
            </div>
          </div>
        </div>
      </FocusScope>
    </div>
  );
}
