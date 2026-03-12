import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus, User as UserIcon, Shield, MapPin, Truck,
  Loader2, Check, AlertCircle, Info, Copy, CheckCheck,
} from 'lucide-react';
import { usersAPI } from '../../../../services/api';
import type { UserRole } from '../../../../types';
import { USER_ROLES, YARDS } from '../constants';
import type { RoleDefinition } from '../constants';
import AccessibleModal from './AccessibleModal';
import RoleBadge from './RoleBadge';

// ── Types ────────────────────────────────────────────────────────────────────
interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Station {
  _id: string;
  stationName: string;
  isActive: boolean;
}

interface FormData {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  station: string;
  yard: string;
}

interface FieldError {
  field: keyof FormData;
  message: string;
}

const INITIAL_FORM: FormData = {
  username: '',
  email: '',
  firstName: '',
  lastName: '',
  role: 'viewer',
  station: '',
  yard: '',
};

const STATION_ROLES: UserRole[] = ['fuel_attendant', 'station_manager'];
const YARD_ROLES: UserRole[] = ['yard_personnel'];

// ── Component ────────────────────────────────────────────────────────────────
export default function CreateUserModal({ isOpen, onClose, onSuccess }: CreateUserModalProps) {
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);
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
        /* stations list failure is non-fatal */
      } finally {
        if (!cancelled) setLoadingStations(false);
      }
    };
    fetchStations();
    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Reset state when modal opens/closes ────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setForm({ ...INITIAL_FORM });
      setErrors([]);
      setServerError(null);
      setSuccess(false);
      setEmailSent(null);
      setCreatedCredentials(null);
      setCopiedField(null);
      setTouched(new Set());
    }
  }, [isOpen]);

  // ── Field change handler ───────────────────────────────────────────────
  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Clear station/yard when role changes
      if (field === 'role') {
        next.station = '';
        next.yard = '';
      }
      return next;
    });
    setTouched(prev => new Set(prev).add(field));
    // Clear field-level error on change
    setErrors(prev => prev.filter(e => e.field !== field));
    setServerError(null);
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────
  const validate = useCallback((): FieldError[] => {
    const errs: FieldError[] = [];
    if (!form.username.trim()) errs.push({ field: 'username', message: 'Username is required' });
    else if (form.username.trim().length < 3) errs.push({ field: 'username', message: 'At least 3 characters' });
    else if (!/^[a-zA-Z0-9._-]+$/.test(form.username.trim())) errs.push({ field: 'username', message: 'Only letters, numbers, dots, hyphens, underscores' });

    if (!form.email.trim()) errs.push({ field: 'email', message: 'Email is required' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.push({ field: 'email', message: 'Enter a valid email address' });

    if (!form.firstName.trim()) errs.push({ field: 'firstName', message: 'First name is required' });
    if (!form.lastName.trim()) errs.push({ field: 'lastName', message: 'Last name is required' });
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

    setSubmitting(true);
    setServerError(null);

    try {
      const payload: any = {
        username: form.username.trim(),
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
      };
      if (requiresStation && form.station) payload.station = form.station;
      if (requiresYard && form.yard) payload.yard = form.yard;

      await usersAPI.create(payload);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1600);
    } catch (err: any) {
      setServerError(err?.response?.data?.message || 'Failed to create user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, requiresStation, requiresYard, onSuccess, onClose]);

  // ── Active stations only ───────────────────────────────────────────────
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
      onClose={submitting || success ? () => {} : onClose}
      title="Create New User"
      subtitle="Password will be generated and sent via email"
      icon={UserPlus}
      iconBg="bg-indigo-100 dark:bg-indigo-900/30"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="text-red-500">*</span> Required fields
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || success}
              className="px-5 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-user-form"
              disabled={submitting || success}
              className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {success && <Check className="w-4 h-4" />}
              {submitting ? 'Creating...' : success ? 'Created!' : 'Create User'}
            </button>
          </div>
        </div>
      }
    >
      {/* Success banner */}
      {success && (
        <div className="mb-4 animate-in fade-in">
          {emailSent ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">User created successfully!</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Login credentials have been sent to the user's email.</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">User created — share credentials manually</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Email notifications are disabled. Copy and share these credentials with the user securely.</p>
                </div>
              </div>
              {createdCredentials && (
                <div className="space-y-2">
                  {([
                    { label: 'Username', value: createdCredentials.username, field: 'username' as const },
                    { label: 'Temporary Password', value: createdCredentials.password, field: 'password' as const },
                  ]).map(({ label, value, field }) => (
                    <div key={field} className="flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-700">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">{label}</div>
                        <div className="text-[13px] font-mono font-semibold text-gray-900 dark:text-gray-100 mt-0.5 select-all">{value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(value);
                          setCopiedField(field);
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                        className="flex-shrink-0 p-1.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                        title={`Copy ${label}`}
                      >
                        {copiedField === field
                          ? <CheckCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                          : <Copy className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-amber-500 dark:text-amber-500 mt-1">The user must change this password on first login.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Failed to create user</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{serverError}</p>
          </div>
        </div>
      )}

      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-6">
        {/* ── Account Information ──────────────────────────────────────── */}
        <fieldset disabled={submitting || success} className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <UserIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
              Account Information
            </legend>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cu-username" className={labelClasses}>
                Username <span className="text-red-500">*</span>
              </label>
              <input
                id="cu-username"
                type="text"
                value={form.username}
                onChange={e => updateField('username', e.target.value)}
                onBlur={() => setTouched(prev => new Set(prev).add('username'))}
                className={inputClasses('username')}
                placeholder="johndoe"
                autoComplete="off"
              />
              {renderFieldError('username')}
            </div>

            <div>
              <label htmlFor="cu-email" className={labelClasses}>
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="cu-email"
                type="email"
                value={form.email}
                onChange={e => updateField('email', e.target.value)}
                onBlur={() => setTouched(prev => new Set(prev).add('email'))}
                className={inputClasses('email')}
                placeholder="john@example.com"
                autoComplete="off"
              />
              {renderFieldError('email')}
            </div>

            <div>
              <label htmlFor="cu-firstName" className={labelClasses}>
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="cu-firstName"
                type="text"
                value={form.firstName}
                onChange={e => updateField('firstName', e.target.value)}
                onBlur={() => setTouched(prev => new Set(prev).add('firstName'))}
                className={inputClasses('firstName')}
                placeholder="John"
              />
              {renderFieldError('firstName')}
            </div>

            <div>
              <label htmlFor="cu-lastName" className={labelClasses}>
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="cu-lastName"
                type="text"
                value={form.lastName}
                onChange={e => updateField('lastName', e.target.value)}
                onBlur={() => setTouched(prev => new Set(prev).add('lastName'))}
                className={inputClasses('lastName')}
                placeholder="Doe"
              />
              {renderFieldError('lastName')}
            </div>
          </div>
        </fieldset>

        {/* ── Role & Permissions ───────────────────────────────────────── */}
        <fieldset disabled={submitting || success} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
              Role & Permissions
            </legend>
          </div>

          <div>
            <label htmlFor="cu-role" className={labelClasses}>
              User Role <span className="text-red-500">*</span>
            </label>
            <select
              id="cu-role"
              value={form.role}
              onChange={e => updateField('role', e.target.value as UserRole)}
              className={inputClasses('role')}
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Role preview card */}
          {selectedRoleDef && (
            <div className={`p-3 rounded-lg ${selectedRoleDef.bgColor} border border-gray-200 dark:border-gray-700`}>
              <div className="flex items-center gap-2 mb-1.5">
                <RoleBadge role={form.role} />
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
          <fieldset disabled={submitting || success} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
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
                <label htmlFor="cu-station" className={labelClasses}>
                  Station <span className="text-red-500">*</span>
                </label>
                <select
                  id="cu-station"
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
          <fieldset disabled={submitting || success} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Truck className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Yard Assignment
              </legend>
            </div>

            <div>
              <label htmlFor="cu-yard" className={labelClasses}>
                Yard <span className="text-red-500">*</span>
              </label>
              <select
                id="cu-yard"
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

        {/* Info box */}
        <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            A secure temporary password will be auto-generated and emailed to the user. They will be required to change it on first login.
          </p>
        </div>
      </form>
    </AccessibleModal>
  );
}
