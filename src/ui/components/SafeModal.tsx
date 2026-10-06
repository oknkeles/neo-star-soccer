/**
 * Kit Modal with the body width-capped to the viewport. The kit centres its card in an
 * implicit auto-width grid column, so a long nowrap line inside (truncate, a long name)
 * would otherwise widen the card past the screen on phones.
 */
import type { ComponentProps } from 'react';
import { Modal as KitModal } from './kit';

export default function SafeModal({ children, footer, ...rest }: ComponentProps<typeof KitModal>) {
  return (
    <KitModal {...rest} footer={footer ? <div className="min-w-0 max-w-[calc(100vw-4.5rem)]">{footer}</div> : undefined}>
      <div className="w-full min-w-0 max-w-[calc(100vw-4.5rem)]">{children}</div>
    </KitModal>
  );
}
