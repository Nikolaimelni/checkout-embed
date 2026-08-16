import type { Money } from '@checkout-embed/contracts';

/**
 * Minor units in, a display string out, and never the other way round. Dividing by a
 * hard coded hundred is wrong for a third of the currencies people actually pay in: the
 * yen has no minor unit and the dinar has three, so the number of digits comes from Intl
 * rather than from an assumption.
 */
export function formatMoney(money: Money, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  // Always present for style: 'currency'. The type says otherwise because the same options
  // bag is shared with the decimal and percent styles, where it is not.
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;

  return format.format(money.amountMinor / 10 ** digits);
}
