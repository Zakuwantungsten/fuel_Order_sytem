import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User as UserIcon, Shield, MapPin, Truck,
  Loader2, AlertCircle, Info, ArrowRight,
} from 'lucide-react';
import { usersAPI } from '../../../../services/api';
import type { User, UserRole } from '../../../../types';
import { USER_ROLES, YARDS } from '../constants';
import type { RoleDefinition } from '../constants';
import AccessibleModal from './AccessibleModal';
import RoleBadge from './RoleBadge';

// ── Types ────────────────────────────────────────────────────────────────────
interface EditUserModalProps {
  isOpen: boolean;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

interface Station {
  _id: string;
  stationName: string;
  isActive: boolean;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  station: string;
  yard: string;
}

interface FieldError {
  field: keyof FormData;
  message: string;
}

const STATION_ROLES: UserRole[] = ['fuel_attendant', 'station_manager'];
const YARD_ROLES: UserRole[] = ['yard_personnel'];

// ── Component ────────────────────────────────────────────────────────────────
export default function EditUserModal({ isOpen, user, onClose, onSuccess }: EditUserModalProps) {
  // ── Initial form derived from user ─────────────────────────────────────
  const initialForm = useMemo<FormData>(() => ({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    role: user.role || 'viewer',
    station: user.station || '',
    yard: user.yard || '',
  }), [user]);

  const [form, setForm] = useState<FormData>(initialForm);
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<keyof FormData>>(new Set());

  // ── Derived state ──────────────────────────────────────────────────────
  const requiresStation = STATION_ROLES.includes(form.role);
  const requiresYard = YARD_ROLES.includes(form.role);
  const selectedRoleDef = useMemo<RoleDefinition | undefined>(
    () => USER_ROLES.find(r => r.value === form.role),
    [form.role],
  );

  // ── Changes detection ──────────────────────────────────────────────────
  const changes = useMemo(() => {
    const diffs: { label: string; from: string; to: string }[] = [];
    if (form.firstName !== initialForm.firstName) diffs.push({ label: 'First Name', from: initialForm.firstName, to: form.firstName });
    if (form.lastName !== initialForm.lastName) diffs.push({ label: 'Last Name', from: initialForm.lastName, to: form.lastName });
    if (form.email !== initialForm.email) diffs.push({ label: 'Email', from: initialForm.email, to: form.email });
    if (form.role !== initialForm.role) diffs.push({ label: 'Role', from: initialForm.role.replace(/_/g, ' '), to: form.role.replace(/_/g, ' ') });
    if (form.station !== initialForm.station) diffs.push({ label: 'Station', from: initialForm.station || '(none)', to: form.station || '(none)' });
    if (form.yard !== initialForm.yard) diffs.push({ label: 'Yard', from: initialForm.yard || '(none)', to: form.yard || '(none)' });
    return diffs;
  }, [form, initialForm]);

  const hasChanges = changes.length > 0;

  // ── Fetch stations ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const fetchStations = async () => {
      setLoadingStations(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'}/config/stations`,
          { headers: { Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}` } },
        );
        if (!response.ok) return;
        const result = await response.json();
        const data = result.data || result.stations || result;
        if (!cancelled) setStations(Array.isArray(data) ? data : []);
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoadingStations(false);
      }
    };
    fetchStations();
    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Reset state when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setForm(initialForm);
      setErrors([]);
      setServerError(null);
      setTouched(new Set());
    }
  }, [isOpen, initialForm]);

  // ── Field change handler ───────────────────────────────────────────────
  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'role') {
        next.station = '';
        next.yard = '';
      }
      return next;
    });
    setTouched(prev => new Set(prev).add(field));
    setErrors(prev => prev.filter(e => e.field !== field));
    setServerError(null);
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────
  const validate = useCallback((): FieldError[] => {
    const errs: FieldError[] = [];
    if (!form.firstName.trim()) errs.push({ field: 'firstName', message: 'First name is required' });
    if (!form.lastName.trim()) errs.push({ field: 'lastName', message: 'Last name is required' });
    if (!form.email.trim()) errs.push({ field: 'email', message: 'Email is required' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.push({ field: 'email', message: 'Enter a valid email address' });
    if (requiresStation && !form.station) errs.push({ field: 'station', message: 'Station is required for this role' });
    if (requiresYard && !form.yard) errs.push({ field: 'yard', message: 'Yard is required for this role' });
    return errs;
  }, [form, requiresStation, requiresYard]);

  const getFieldError = useCallback(
    (field: keyof FormData) => errors.find(e => e.field === field)?.message,
    [errors],
  );

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!hasChanges) return;

    setSubmitting(true);
    setServerError(null);

    try {
      const payload: Record<string, string> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        role: form.role,
      };
      if (requiresStation && form.station) payload.station = form.station;
      if (requiresYard && form.yard) payload.yard = form.yard;

      const userId = String(user.id || (user as any)._id);
      await usersAPI.update(userId, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setServerError(err?.response?.data?.message || 'Failed to update user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, hasChanges, requiresStation, requiresYard, user, onSuccess, onClose]);

  // ── Active stations ────────────────────────────────────────────────────
  const activeStations = useMemo(
    () => stations.filter(s => s.isActive),
    [stations],
  );

  // ── Render helpers ─────────────────────────────────────────────────────
  const inputClasses = (field: keyof FormData) => {
    const hasError = getFieldError(field) && touched.has(field);
    return `w-full px-4 py-2.5 text-sm border rounded-lg transition-colors focus:ring-2 focus:outline-none
      ${hasError
        ? 'border-red-300 dark:border-red-600 focus:ring-red-500 bg-red-50/50 dark:bg-red-900/10'
        : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700'
      }
      text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`;
  };

  const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';

  const renderFieldError = (field: keyof FormData) => {
    const msg = getFieldError(field);
    if (!msg || !touched.has(field)) return null;
    return (
      <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {msg}
      </p>
    );
  };

  // ── Modal content ──────────────────────────────────────────────────────
  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title="Edit User"
      subtitle={user.username}
      icon={UserIcon}
      iconBg="bg-indigo-100 dark:bg-indigo-900/30"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {hasChanges
              ? <span className="text-indigo-600 dark:text-indigo-400 font-medium">{changes.length} change(s) pending</span>
              : 'No changes made'
            }
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-user-form"
              disabled={submitting || !hasChanges}
              className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      }
    >
      {/* Server error */}
      {serverError && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Failed to update user</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{serverError}</p>
          </div>
        </div>
      )}

      {/* Changes summary */}
      {hasChanges && (
        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <p className="text-xs font-medium text-indigo-800 dark:text-indigo-300 mb-2">Pending changes:</p>
          <div className="space-y-1">
            {changes.map(c => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{c.label}</span>
                <span className="text-gray-600 dark:text-gray-400 truncate max-w-[100px]">{c.from}</span>
                <ArrowRight className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                <span className="font-medium text-indigo-700 dark:text-indigo-300 truncate max-w-[100px]">{c.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <form id="edit-user-form" onSubmit={handleSubmit} className="space-y-6">
        {/* ── Personal Information ─────────────────────────────────────── */}
        <fieldset disabled={submitting} className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <UserIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
              Personal Information
            </legend>
          </div>

          {/* Username (read-only) */}
          <div>
            <label className={labelClasses}>Username</label>
            <div className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed">
              {user.username}
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Username cannot be changed</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="eu-firstName" className={labelClasses}>
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="eu-firstName"
                type="text"
                value={form.firstName}
                onChange={e => updateField('firstName', e.target.value)}
                onBlur={() => setTouched(prev => new Set(prev).add('firstName'))}
                className={inputClasses('firstName')}
              />
              {renderFieldError('firstName')}
            </div>

            <div>
              <label htmlFor="eu-lastName" className={labelClasses}>
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="eu-lastName"
                type="text"
                value={form.lastName}
                onChange={e => updateField('lastName', e.target.value)}
                onBlur={() => setTouched(prev => new Set(prev).add('lastName'))}
                className={inputClasses('lastName')}
              />
              {renderFieldError('lastName')}
            </div>
          </div>

          <div>
            <label htmlFor="eu-email" className={labelClasses}>
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              id="eu-email"
              type="email"
              value={form.email}
              onChange={e => updateField('email', e.target.value)}
              onBlur={() => setTouched(prev => new Set(prev).add('email'))}
              className={inputClasses('email')}
            />
            {renderFieldError('email')}
          </div>
        </fieldset>

        {/* ── Role & Permissions ───────────────────────────────────────── */}
        <fieldset disabled={submitting} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
              Role & Permissions
            </legend>
          </div>

          <div>
            <label htmlFor="eu-role" className={labelClasses}>
              User Role <span className="text-red-500">*</span>
            </label>
            <select
              id="eu-role"
              value={form.role}
              onChange={e => updateField('role', e.target.value as UserRole)}
              className={inputClasses('role')}
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {selectedRoleDef && (
            <div className={`p-3 rounded-lg ${selectedRoleDef.bgColor} border border-gray-200 dark:border-gray-700`}>
              <div className="flex items-center gap-2 mb-1.5">
                <RoleBadge role={form.role} />
                {form.role !== initialForm.role && (
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">(changed)</span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{selectedRoleDef.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedRoleDef.permissionSummary.map(perm => (
                  <span key={perm} className="inline-flex items-center text-xs px-2 py-0.5 bg-white/60 dark:bg-gray-800/60 rounded text-gray-700 dark:text-gray-300">
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        {/* ── Station Assignment ───────────────────────────────────────── */}
        {requiresStation && (
          <fieldset disabled={submitting} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              </div>
              <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Station Assignment
              </legend>
            </div>

            {loadingStations ? (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading stations...</span>
              </div>
            ) : activeStations.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm text-yellow-800 dark:text-yellow-200">No active stations available</span>
              </div>
            ) : (
              <div>
                <label htmlFor="eu-station" className={labelClasses}>
                  Station <span className="text-red-500">*</span>
                </label>
                <select
                  id="eu-station"
                  value={form.station}
                  onChange={e => updateField('station', e.target.value)}
                  className={inputClasses('station')}
                >
                  <option value="">Select a station</option>
                  {activeStations.map(s => (
                    <option key={s._id} value={s.stationName}>{s.stationName}</option>
                  ))}
                </select>
                {renderFieldError('station')}
              </div>
            )}
          </fieldset>
        )}

        {/* ── Yard Assignment ──────────────────────────────────────────── */}
        {requiresYard && (
          <fieldset disabled={submitting} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Truck className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Yard Assignment
              </legend>
            </div>

            <div>
              <label htmlFor="eu-yard" className={labelClasses}>
                Yard <span className="text-red-500">*</span>
              </label>
              <select
                id="eu-yard"
                value={form.yard}
                onChange={e => updateField('yard', e.target.value)}
                className={inputClasses('yard')}
              >
                <option value="">Select a yard</option>
                {YARDS.map(y => (
                  <option key={y.value} value={y.value}>{y.label}</option>
                ))}
              </select>
              {renderFieldError('yard')}
            </div>
          </fieldset>
        )}
      </form>
    </AccessibleModal>
  );
}
