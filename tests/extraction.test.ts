import { describe, expect, it } from 'vitest';
import { analyseText, classify, extractFields, suggestedActions } from '@/lib/extraction';
import { parseEml, looksLikeEml } from '@/lib/eml';

const GIFT_CARD = `
BLUEBIRD BOOKS
Thank you for your purchase.

e-Gift Card
Gift card value: INR 2,500.00
Gift card code: BB-7781-4432
Issued on: 12 Mar 2026
Valid till 31/12/2026

Redeemable at bluebirdbooks.in and in store.
Cannot be exchanged for cash. Minimum purchase of INR 500 applies.
`;

const REFUND_EMAIL = `
Zentra Electronics — your return has been accepted

Order No: ZE-884512
Purchase date: 18 September 2026

We have accepted your return request. Your refund of INR 3,799.00 will be
credited to the original payment method within 7 business days.
`;

const CLASS_PACK = `
STILL POINT STUDIO
Tax invoice SP-2291
Issued on: 02 Aug 2026
Package: pack of 10 classes
Amount: INR 6000.00
Valid till: 30 Nov 2026
Not valid with any other offer.
`;

describe('classification', () => {
  it('recognises a gift card', () => {
    const c = classify(GIFT_CARD);
    expect(c.classification).toBe('gift_card');
    expect(c.reasons.length).toBeGreaterThan(0);
  });

  it('recognises a refund notification as a case, not a benefit', () => {
    expect(classify(REFUND_EMAIL).classification).toBe('refund_case');
  });

  it('recognises a prepaid package', () => {
    expect(classify(CLASS_PACK).classification).toBe('prepaid_service');
  });

  it('refuses to guess from a single weak keyword', () => {
    expect(classify('Thanks for shopping with us. See you soon.').classification).toBeNull();
  });
});

describe('field extraction', () => {
  it('pulls the labelled values out of a gift card', () => {
    const f = extractFields(GIFT_CARD, { defaultCurrency: 'INR', today: '2026-10-20' });
    expect(f.currency?.value).toBe('INR');
    expect(f.amountMinor?.value).toBe(250_000);
    expect(f.amountMinor?.confidence).toBe('high');
    expect(f.expiresAt?.value).toBe('2026-12-31');
    expect(f.issuedAt?.value).toBe('2026-03-12');
    expect(f.code?.value).toBe('BB-7781-4432');
    expect(f.code?.sensitive).toBe(true);
    expect(f.conditions?.value).toMatch(/cash|minimum/i);
  });

  it('never echoes a redemption code into the evidence line', () => {
    const f = extractFields(GIFT_CARD, { defaultCurrency: 'INR' });
    expect(f.code?.evidence).not.toContain('7781');
    expect(f.code?.evidence).not.toContain('BB-');
  });

  it('reads a refund amount, order number and window', () => {
    const f = extractFields(REFUND_EMAIL, { defaultCurrency: 'INR', today: '2026-10-20' });
    expect(f.amountMinor?.value).toBe(379_900);
    expect(f.orderRef?.value).toBe('ZE-884512');
    // 7 business days counted from the purchase date found in the text
    expect(f.expectedByDate?.value).toBe('2026-09-25');
  });

  it('takes the later bound of a refund window range, never the earlier one', () => {
    const f = extractFields('Your refund will be credited in 7-10 business days.', {
      defaultCurrency: 'INR',
      today: '2026-10-20',
    });
    expect(f.expectedByDate?.value).toBe('2026-10-30');
  });

  it('ignores a day count that has nothing to do with a refund', () => {
    const f = extractFields('Delivery arrives within 3 days. Enjoy your order.', {
      defaultCurrency: 'INR',
      today: '2026-10-20',
    });
    expect(f.expectedByDate).toBeUndefined();
  });

  it('marks a loosely-inferred value as low confidence', () => {
    const f = extractFields('Your balance is ₹450 and we hope you enjoy it.', {
      defaultCurrency: 'INR',
    });
    expect(f.amountMinor?.value).toBe(45_000);
    expect(['low', 'medium']).toContain(f.amountMinor?.confidence);
  });

  it('proposes nothing it cannot find', () => {
    const f = extractFields('Hello, thanks for visiting the shop today.', {
      defaultCurrency: 'INR',
    });
    expect(f.amountMinor).toBeUndefined();
    expect(f.expiresAt).toBeUndefined();
  });
});

describe('analyseText', () => {
  it('flags text that is too short to say anything about', () => {
    const r = analyseText('hi', { defaultCurrency: 'INR' });
    expect(r.insufficientText).toBe(true);
    expect(r.classification).toBeNull();
  });

  it('suggests tracking a refund case when the document is one', () => {
    const r = analyseText(REFUND_EMAIL, { defaultCurrency: 'INR' });
    expect(suggestedActions(r).join(' ')).toMatch(/refund case/i);
  });

  it('warns when a code was found so the user knows it will be encrypted', () => {
    const r = analyseText(GIFT_CARD, { defaultCurrency: 'INR' });
    expect(suggestedActions(r).join(' ')).toMatch(/encrypted/i);
  });
});

describe('eml parsing', () => {
  const EML = [
    'From: Zentra Support <support@zentra.example>',
    'To: me@example.test',
    'Subject: =?utf-8?B?WW91ciByZWZ1bmQgaXMgb24gaXRzIHdheQ==?=',
    'Date: Tue, 06 Oct 2026 09:15:00 +0530',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Your refund of INR 3=2C799.00 has been initiated for Order No: ZE-884512.',
    'It should arrive within 7 business days.',
  ].join('\r\n');

  it('detects an email file', () => {
    expect(looksLikeEml(EML)).toBe(true);
    expect(looksLikeEml('just some text')).toBe(false);
  });

  it('decodes headers and a quoted-printable body', () => {
    const p = parseEml(EML);
    expect(p.from).toBe('support@zentra.example');
    expect(p.fromName).toBe('Zentra Support');
    expect(p.fromDomain).toBe('zentra.example');
    expect(p.subject).toBe('Your refund is on its way');
    expect(p.date).toBe('2026-10-06');
    expect(p.text).toContain('ZE-884512');
    expect(p.text).toContain('3,799.00');
  });

  it('prefers the plain text part of a multipart email and strips html', () => {
    const multipart = [
      'From: Shop <hello@shop.example>',
      'Subject: Gift card',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain',
      '',
      'Gift card value: INR 1000.00',
      '--b1',
      'Content-Type: text/html',
      '',
      '<p>Gift card value: <b>INR 1000.00</b></p>',
      '--b1--',
    ].join('\r\n');
    const p = parseEml(multipart);
    expect(p.text).toContain('Gift card value: INR 1000.00');
    expect(p.text).not.toContain('<b>');
  });

  it('uses the sender as a high-confidence merchant hint', () => {
    const p = parseEml(EML);
    const f = extractFields(p.text, {
      defaultCurrency: 'INR',
      context: { merchant: p.fromName, date: p.date ?? undefined, subject: p.subject },
    });
    expect(f.merchant?.value).toBe('Zentra Support');
    expect(f.merchant?.confidence).toBe('high');
    expect(f.amountMinor?.value).toBe(379_900);
  });
});
