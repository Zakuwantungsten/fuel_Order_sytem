import { useState, useCallback } from 'react';

export interface OfficerConfig {
  searchMonths: number;    // how many months back to search trucks (3 | 6 | 12 | 24)
  maxResults: number;      // max results returned per truck search (20 | 50 | 100 | 0=all)
  defaultTab: 'overview' | 'do';
}

const DEFAULTS: OfficerConfig = {
  searchMonths: 6,
  maxResults: 50,
  defaultTab: 'overview',
};

const key = (role: string) => `officer_config_${role}`;

export const readOfficerConfig = (role: string): OfficerConfig => {
  try {
    const raw = localStorage.getItem(key(role));
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
};

const writeOfficerConfig = (role: string, cfg: OfficerConfig): void => {
  try {
    localStorage.setItem(key(role), JSON.stringify(cfg));
  } catch {}
};

export const useOfficerConfig = (role: string) => {
  const [config, setConfigState] = useState<OfficerConfig>(() => readOfficerConfig(role));

  const saveConfig = useCallback(
    (updates: Partial<OfficerConfig>) => {
      const next = { ...config, ...updates };
      writeOfficerConfig(role, next);
      setConfigState(next);
    },
    [config, role],
  );

  return { config, saveConfig };
};
