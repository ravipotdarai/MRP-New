import {parseCatalog, catalogToFirebase} from '../opsCatalogModel';

describe('opsCatalogModel', () => {
  it('round-trips promotions and coupons', () => {
    const parsed = parseCatalog({
      promotions: {a: {title: 'Launch', subtitle: 'hi', url: 'https://x'}},
      coupons: {WELCOME10: {code: 'WELCOME10', percent: 10, label: '10%', active: true}},
    });
    expect(parsed.promotions[0].title).toBe('Launch');
    expect(parsed.coupons[0].code).toBe('WELCOME10');
    const fb = catalogToFirebase(parsed);
    const again = parseCatalog(fb);
    expect(again.promotions[0].url).toBe('https://x');
    expect(again.coupons[0].percent).toBe(10);
  });
});
