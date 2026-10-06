import { type ReactNode, useEffect, useRef } from 'react';
import { boolean, literal, object, string } from 'zod';
import { Button } from './HostElement.js';
import type { Labels } from './labels.js';

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    const expectedOrigin = new URL(actionUrl).origin;

    const onMessage = (event: MessageEvent): void => {
      // origin alone would accept any window on the provider's site
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
        // Escape would close the dialog behind the state machine's back
        event.preventDefault();
        onDismissed();
      }}
    >
      <div className="challenge">
        <h2 className="heading">{labels.challengeTitle}</h2>
        <p className="status">{labels.challengeHint}</p>
        <iframe
          ref={frameRef}
          className="challenge-frame"
          src={actionUrl}
          title={labels.challengeTitle}
          sandbox="allow-scripts allow-forms allow-same-origin"
          referrerPolicy="no-referrer"
        />
        <div className="actions">
          <Button hostTag={hostButtonTag} onClick={onFinished}>
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
