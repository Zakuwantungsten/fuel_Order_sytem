import { useCallback, useEffect, useState } from 'react';
import { Save, Settings2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { visaOverstayAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import UnifiedTabLoader from '../SuperAdmin/common/UnifiedTabLoader';

type Config = {
  reserveDays: number;
  overstayCycleDays: number;
  graceDays: number;
  overstayAmount: number;
  visaAmount: number;
  duplicateTruckLookbackDays: number;
  nameFuzzyThreshold: number;
  nameFuzzyMinLength: number;
  allowMultiBuild: boolean;
};

export default function ClerkConfig() {
  const { isDark } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Config>({
    reserveDays: 2,
    overstayCycleDays: 10,
    graceDays: 5,
    overstayAmount: 50,
    visaAmount: 50,
    duplicateTruckLookbackDays: 30,
    nameFuzzyThreshold: 78,
    nameFuzzyMinLength: 4,
    allowMultiBuild: false,
  });

  const card = {
    background: isDark ? '#1E293B' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
  };
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const muted = '#64748B';
  const fieldCls = `w-full px-3 h-[40px] text-sm rounded-lg border ${
    isDark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-slate-900'
  }`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await visaOverstayAPI.getConfig();
      setForm({
        reserveDays: cfg.reserveDays ?? 2,
        overstayCycleDays: cfg.overstayCycleDays ?? 10,
        graceDays: cfg.graceDays ?? 5,
        overstayAmount: cfg.overstayAmount ?? 50,
        visaAmount: cfg.visaAmount ?? 50,
        duplicateTruckLookbackDays: cfg.duplicateTruckLookbackDays ?? 30,
        nameFuzzyThreshold: cfg.nameFuzzyThreshold ?? 78,
        nameFuzzyMinLength: cfg.nameFuzzyMinLength ?? 4,
        allowMultiBuild: Boolean(cfg.allowMultiBuild),
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (form.reserveDays < 0 || form.overstayCycleDays < 1) {
      toast.error('Reserve days ≥ 0 and cycle days ≥ 1');
      return;
    }
    if (form.overstayAmount < 0 || form.visaAmount < 0) {
      toast.error('Amounts cannot be negative');
      return;
    }
    if (form.duplicateTruckLookbackDays < 1 || form.duplicateTruckLookbackDays > 365) {
      toast.error('Truck lookback must be 1–365 days');
      return;
    }
    if (form.nameFuzzyThreshold < 50 || form.nameFuzzyThreshold > 100) {
      toast.error('Name fuzzy threshold must be 50–100%');
      return;
    }
    setBusy(true);
    try {
      await visaOverstayAPI.updateConfig(form);
      toast.success('Configuration saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <UnifiedTabLoader label="Loading configuration..." heightClassName="h-48" />;

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: text }}>
          <Settings2 className="w-5 h-5 text-teal-600" /> Configuration
        </h2>
        <p className="text-sm" style={{ color: muted }}>
          Reserve window, overstay cycle, payout amounts, and Add-truck fraud checks
        </p>
      </div>

      <div className="rounded-xl border p-5 space-y-4" style={card}>
        <label className="block text-sm" style={{ color: text }}>
          Days reserve (inland / mines — days before passport due)
          <input
            type="number"
            min={0}
            max={30}
            className={`${fieldCls} mt-1`}
            value={form.reserveDays}
            onChange={(e) => setForm({ ...form, reserveDays: Number(e.target.value) })}
          />
          <span className="text-xs" style={{ color: muted }}>
            Whisky→border still pays on exact due date. Raw input in this window is pulled into Build review.
          </span>
        </label>

        <label className="block text-sm" style={{ color: text }}>
          Overstay cycle days
          <input
            type="number"
            min={1}
            max={60}
            className={`${fieldCls} mt-1`}
            value={form.overstayCycleDays}
            onChange={(e) => setForm({ ...form, overstayCycleDays: Number(e.target.value) })}
          />
          <span className="text-xs" style={{ color: muted }}>
            After first payout, next overstay is due every N days until crossed. Also used for border
            intake settlement (days to due − this value) × $5.
          </span>
        </label>

        <label className="block text-sm" style={{ color: text }}>
          Grace days (crossed extra settlement)
          <input
            type="number"
            min={0}
            max={30}
            className={`${fieldCls} mt-1`}
            value={form.graceDays}
            onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm" style={{ color: text }}>
            Overstay amount ($)
            <input
              type="number"
              min={0}
              className={`${fieldCls} mt-1`}
              value={form.overstayAmount}
              onChange={(e) => setForm({ ...form, overstayAmount: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm" style={{ color: text }}>
            Visa amount ($)
            <input
              type="number"
              min={0}
              className={`${fieldCls} mt-1`}
              value={form.visaAmount}
              onChange={(e) => setForm({ ...form, visaAmount: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="pt-2 border-t space-y-4" style={{ borderColor: card.borderColor }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: muted }}>
            Add truck — duplicate / fraud checks
          </p>

          <label className="block text-sm" style={{ color: text }}>
            Truck lookback days
            <input
              type="number"
              min={1}
              max={365}
              className={`${fieldCls} mt-1`}
              value={form.duplicateTruckLookbackDays}
              onChange={(e) =>
                setForm({ ...form, duplicateTruckLookbackDays: Number(e.target.value) })
              }
            />
            <span className="text-xs" style={{ color: muted }}>
              Flag if truck already appears in Raw, or was submitted within this many days (e.g. after
              leaving Raw into Build). Default 30 ≈ one month.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm" style={{ color: text }}>
              Name fuzzy match %
              <input
                type="number"
                min={50}
                max={100}
                className={`${fieldCls} mt-1`}
                value={form.nameFuzzyThreshold}
                onChange={(e) =>
                  setForm({ ...form, nameFuzzyThreshold: Number(e.target.value) })
                }
              />
              <span className="text-xs" style={{ color: muted }}>
                Flag similar names on other trucks (passport fraud). 78 = fairly close.
              </span>
            </label>
            <label className="block text-sm" style={{ color: text }}>
              Min name length to check
              <input
                type="number"
                min={2}
                max={20}
                className={`${fieldCls} mt-1`}
                value={form.nameFuzzyMinLength}
                onChange={(e) =>
                  setForm({ ...form, nameFuzzyMinLength: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: text }}>
            <input
              type="checkbox"
              className="mt-1"
              checked={form.allowMultiBuild}
              onChange={(e) => setForm({ ...form, allowMultiBuild: e.target.checked })}
            />
            <span>
              Allow multi-build / rebuild
              <span className="block text-xs mt-0.5" style={{ color: muted }}>
                When on, you can Rebuild a day that was already built. Rebuild restores pending
                trucks to Raw / Waiting, clears Build review, then runs Build day again.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            disabled={busy}
            onClick={save}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-teal-600 text-white disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> Save configuration
          </button>
        </div>
      </div>
    </div>
  );
}
