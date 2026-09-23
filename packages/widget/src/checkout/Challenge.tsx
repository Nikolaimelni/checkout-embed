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
  readonly onDismissed: () => void;
};

export function Challenge({
  actionUrl,
  intentId,
  labels,
  hostButtonTag,
  onFinished,
  onDismissed,
}: Props): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Syncs with the browser's top layer. A modal dialog is drawn above the whole page, so
  // a transform or an overflow on one of the host's elements around our container cannot
  // clip it the way it clips position: fixed. Focus goes to the dialog itself, which gets
  // its label read out before the iframe takes over.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);

  // Syncs with the challenge iframe, a document on the provider's origin that posts a
  // message when somebody finishes with it.
  useEffect(() => {
    const expectedOrigin = new URL(actionUrl).origin;

    const onMessage = (event: MessageEvent): void => {
      // Origin alone would also let another window of the provider's site, or a second
      // copy of this widget, finish someone else's challenge.
      if (event.origin !== expectedOrigin || event.source !== frameRef.current?.contentWindow) {
        return;
      }

      const result = ChallengeResultSchema.safeParse(event.data);
      if (!result.success || result.data.intentId !== intentId) return;

      onFinished();
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [actionUrl, intentId, onFinished]);

  return (
    <dialog
      className="dialog"
      aria-label={labels.challengeTitle}
      tabIndex={-1}
      ref={dialogRef}
      onCancel={(event) => {
        // Escape would close the dialog behind the machine's back and leave it waiting.
        event.preventDefault();
        onDismissed();
      }}
    >
      <div className="challenge">
        <h2 className="heading">{labels.challengeTitle}</h2>
        <p className="status">{labels.challengeHint}</p>
        {/* The bank's page needs scripts, its form and its own origin for postMessage. It
            does not need to navigate the merchant's page away, which sandbox takes from it. */}
        <iframe
          ref={frameRef}
          className="challenge-frame"
          src={actionUrl}
          title={labels.challengeTitle}
          sandbox="allow-scripts allow-forms allow-same-origin"
          referrerPolicy="no-referrer"
        />
        <div className="actions">
          <Button hostTag={hostButtonTag} variant="secondary" onClick={onFinished}>
            {labels.challengeDone}
          </Button>
          <Button hostTag={hostButtonTag} variant="secondary" onClick={onDismissed}>
            {labels.challengeCancel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
