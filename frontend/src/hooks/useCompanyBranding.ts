import { useState, useEffect } from 'react';
import { systemConfigAPI } from '../services/systemConfigService';
import fallbackLogo from '../assets/logo.png';

export interface CompanyBranding {
  companyName: string;
  companyWebsite: string;
  companyEmail: string;
  companyPhone: string;
  logoUrl: string;
}

const DEFAULT_BRANDING: CompanyBranding = {
  companyName: '',
  companyWebsite: '',
  companyEmail: '',
  companyPhone: '',
  logoUrl: fallbackLogo,
};

// Module-level cache so only one API call is made per browser session
let cachedBranding: CompanyBranding | null = null;
let fetchPromise: Promise<CompanyBranding> | null = null;

async function fetchBranding(): Promise<CompanyBranding> {
  if (cachedBranding) return cachedBranding;
  if (!fetchPromise) {
    fetchPromise = systemConfigAPI
      .getSystemSettings()
      .then(settings => {
        const g = settings.general;
        const result: CompanyBranding = {
          companyName: g.companyName || DEFAULT_BRANDING.companyName,
          companyWebsite: g.companyWebsite || DEFAULT_BRANDING.companyWebsite,
          companyEmail: g.companyEmail || DEFAULT_BRANDING.companyEmail,
          companyPhone: g.companyPhone || DEFAULT_BRANDING.companyPhone,
          logoUrl: g.logoUrl || DEFAULT_BRANDING.logoUrl,
        };
        cachedBranding = result;
        return result;
      })
      .catch(() => DEFAULT_BRANDING)
      .finally(() => { fetchPromise = null; });
  }
  return fetchPromise;
}

export function useCompanyBranding(): CompanyBranding {
  const [branding, setBranding] = useState<CompanyBranding>(
    cachedBranding ?? DEFAULT_BRANDING
  );

  useEffect(() => {
    if (cachedBranding) {
      setBranding(cachedBranding);
      return;
    }
    let cancelled = false;
    fetchBranding().then(result => {
      if (!cancelled) setBranding(result);
    });
    return () => { cancelled = true; };
  }, []);

  return branding;
}
