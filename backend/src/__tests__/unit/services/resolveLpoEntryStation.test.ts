import { resolveLpoEntryStation } from '../../../services/reconciliationService';

describe('resolveLpoEntryStation', () => {
  it('prefers picked-at station over LPO order station / dieselAt', () => {
    expect(
      resolveLpoEntryStation({
        dieselAt: 'STATION A',
        station: 'STATION A',
        pickedAtStation: 'STATION B',
      })
    ).toBe('STATION B');
  });

  it('falls back to dieselAt / station when picked-at is empty', () => {
    expect(
      resolveLpoEntryStation({
        dieselAt: 'STATION A',
        station: 'STATION A',
        pickedAtStation: '',
      })
    ).toBe('STATION A');
  });

  it('resolves CUSTOM picked-at to customStationName', () => {
    expect(
      resolveLpoEntryStation({
        dieselAt: 'STATION A',
        station: 'STATION A',
        pickedAtStation: 'CUSTOM',
        customStationName: 'ROADSIDE PUMP',
      })
    ).toBe('ROADSIDE PUMP');
  });

  it('still resolves CUSTOM order station when no picked-at', () => {
    expect(
      resolveLpoEntryStation({
        dieselAt: 'CUSTOM',
        station: 'CUSTOM',
        isCustomStation: true,
        customStationName: 'ROADSIDE PUMP',
      })
    ).toBe('ROADSIDE PUMP');
  });

  it('does not let stale isCustomStation override a concrete picked-at station', () => {
    expect(
      resolveLpoEntryStation({
        dieselAt: 'STATION B',
        station: 'CUSTOM',
        pickedAtStation: 'STATION B',
        isCustomStation: true,
        customStationName: 'ROADSIDE PUMP',
      })
    ).toBe('STATION B');
  });
});
