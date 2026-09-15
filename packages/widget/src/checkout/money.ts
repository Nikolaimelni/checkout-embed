import type { Money } from '@checkout-embed/contracts';

// ISO 4217 exponents other than two. Intl cannot supply these: its fraction digits are
// CLDR's view of how a price looks, and for HUF and IDR it shows none while the provider
// still counts in hundredths, which put the Pay screen off by a factor of a hundred.
const NO_MINOR_UNIT = new Set(
  'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF'.split(' '),
);
const THOUSANDTHS = new Set('BHD IQD JOD KWD LYD OMR TND'.split(' '));
const TEN_THOUSANDTHS = new Set(['CLF', 'UYW']);

function exponentOf(currency: string): number {
  if (NO_MINOR_UNIT.has(currency)) return 0;
  if (THOUSANDTHS.has(currency)) return 3;
  if (TEN_THOUSANDTHS.has(currency)) return 4;
  return 2;
}

/** Minor units in, a display string out, and never the other way round. */
export function formatMoney(money: Money, locale: string): string {
  const digits = exponentOf(money.currency);
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return format.format(money.amountMinor / 10 ** digits);
}
