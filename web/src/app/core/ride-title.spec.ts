import { rideDisplayTitle } from './ride-title';

describe('rideDisplayTitle', () => {
  const base = { startedAt: '2026-07-19T08:00:00.000Z' };

  it('uses the shared manual, AI, smart, route, then date precedence', () => {
    expect(rideDisplayTitle({ ...base, title: '  Manual title ', aiTitle: 'AI', smartTitle: 'Smart' })).toBe('Manual title');
    expect(rideDisplayTitle({ ...base, aiTitle: 'AI title', smartTitle: 'Smart' })).toBe('AI title');
    expect(rideDisplayTitle({ ...base, smartTitle: 'Smart title' })).toBe('Smart title');
    expect(rideDisplayTitle({ ...base, startLabel: 'Pune', endLabel: 'Lonavala' })).toBe('Pune to Lonavala');
    expect(rideDisplayTitle(base)).toMatch(/ ride$/);
  });
});
