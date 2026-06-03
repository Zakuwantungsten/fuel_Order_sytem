import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus, User as UserIcon, Shield, MapPin, Truck,
  Loader2, Check, AlertCircle, Info, Copy, CheckCheck,
  Link2, KeyRound, Lock,
} from 'lucide-react';

type ProvisioningMethod = 'temp_password' | 'email_link' | 'manual';
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
const USER_CREATE_ROLE_OPTIONS = USER_ROLES.filter(r => r.value !== 'driver');

// ── Credentials display helper ───────────────────────────────────────────────
function CredentialsDisplay({
  credentials,
  copiedField,
  setCopiedField,
  accentClass = 'amber',
}: {
  credentials: { username: string; password: string };
  copiedField: 'username' | 'password' | null;
  setCopiedField: (f: 'username' | 'password' | null) => void;
  accentClass?: string;
}) {
  const borderColor = accentClass === 'indigo'
    ? 'border-indigo-200 dark:border-indigo-700'
    : 'border-amber-200 dark:border-amber-700';
  const textColor = accentClass === 'indigo'
    ? 'text-indigo-600 dark:text-indigo-400'
    : 'text-amber-600 dark:text-amber-400';
  const hoverBg = accentClass === 'indigo'
    ? 'hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
    : 'hover:bg-amber-100 dark:hover:bg-amber-900/40';

  return (
    <div className="space-y-2">
      {([
        { label: 'Username', value: credentials.username, field: 'username' as const },
        { label: 'Temporary Password', value: credentials.password, field: 'password' as const },
      ]).map(({ label, value, field }) => (
        <div key={field} className={`flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border ${borderColor}`}>
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${textColor}`}>{label}</div>
            <div className="text-[13px] font-mono font-semibold text-gray-900 dark:text-gray-100 mt-0.5 select-all">{value}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopiedField(field);
              setTimeout(() => setCopiedField(null), 2000);
            }}
            className={`flex-shrink-0 p-1.5 rounded-md ${hoverBg} transition-colors`}
            title={`Copy ${label}`}
          >
            {copiedField === field
              ? <CheckCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
              : <Copy className={`w-4 h-4 ${textColor}`} />}
          </button>
        </div>
      ))}
      <p className={`text-[11px] ${textColor} mt-1`}>The user must change this password on first login.</p>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CreateUserModal({ isOpen, onClose, onSuccess }: CreateUserModalProps) {
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });
  const [stations, setStations] = useState<Station[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [provisioningMethod, setProvisioningMethod] = useState<ProvisioningMethod>('temp_password');
  const [customPassword, setCustomPassword] = useState('');
  const [showCustomPw, setShowCustomPw] = useState(false);
  const [provisioningMethodUsed, setProvisioningMethodUsed] = useState<ProvisioningMethod>('temp_password');
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
      setProvisioningMethod('temp_password');
      setCustomPassword('');
      setShowCustomPw(false);
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

  const customPasswordError = provisioningMethod === 'manual' && customPassword.length > 0 && customPassword.length < 4
    ? 'Minimum 4 characters'
    : null;

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
    if (provisioningMethod === 'manual' && customPassword.length < 4) {
      setServerError('Please enter a password of at least 4 characters for manual provisioning.');
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
        provisioningMethod,
      };
      if (requiresStation && form.station) payload.station = form.station;
      if (requiresYard && form.yard) payload.yard = form.yard;
      if (provisioningMethod === 'manual') payload.customPassword = customPassword;

      const result = await usersAPI.create(payload);
      setEmailSent(result.emailSent);
      setProvisioningMethodUsed(provisioningMethod);
      if (result.temporaryPassword) {
        setCreatedCredentials({ username: form.username.trim(), password: result.temporaryPassword });
      }
      setSuccess(true);

      // For manual provisioning the admin needs time to copy the password — don't auto-close.
      // For other methods auto-close after a short delay.
      if (provisioningMethod !== 'manual') {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1800);
      } else {
        // Signal the parent that a user was created so the list refreshes,
        // but keep the modal open so the admin can copy the password.
        onSuccess();
      }
    } catch (err: any) {
      setServerError(err?.response?.data?.message || 'Failed to create user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, provisioningMethod, customPassword, requiresStation, requiresYard, onSuccess, onClose]);

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
        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700'
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
      subtitle={
        provisioningMethod === 'email_link' ? 'User will receive an activation link via email' :
        provisioningMethod === 'manual' ? 'You will set the initial password manually' :
        'A temporary password will be generated and emailed'
      }
      icon={UserPlus}
      iconBg="bg-blue-100 dark:bg-blue-900/30"
      size="lg"
      footer={
        success && provisioningMethodUsed === 'manual' ? (
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          </div>
        ) : (
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
                disabled={submitting || success || (provisioningMethod === 'manual' && customPassword.length < 4)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {success && <Check className="w-4 h-4" />}
                {submitting ? 'Creating...' : success ? 'Created!' : 'Create User'}
              </button>
            </div>
          </div>
        )
      }
    >
      {/* Success banner */}
      {success && (
        <div className="mb-4 animate-in fade-in">
          {/* ── Email link sent ── */}
          {provisioningMethodUsed === 'email_link' && emailSent && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">User created — activation link sent!</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">The user will receive an email with a link to set their password.</p>
              </div>
            </div>
          )}

          {/* ── Email link failed ── */}
          {provisioningMethodUsed === 'email_link' && !emailSent && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">User created — activation email failed</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Check email configuration, then resend the link from the user detail page.</p>
              </div>
            </div>
          )}

          {/* ── Temp password sent by email ── */}
          {provisioningMethodUsed === 'temp_password' && emailSent && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">User created successfully!</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Login credentials have been sent to the user's email.</p>
              </div>
            </div>
          )}

          {/* ── Temp password — email failed or disabled ── */}
          {provisioningMethodUsed === 'temp_password' && !emailSent && createdCredentials && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">User created — share credentials manually</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Email failed or is disabled. Share these credentials with the user securely.</p>
                </div>
              </div>
              <CredentialsDisplay credentials={createdCredentials} copiedField={copiedField} setCopiedField={setCopiedField} />
            </div>
          )}

          {/* ── Manual password — always show to copy ── */}
          {provisioningMethodUsed === 'manual' && createdCredentials && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">User created — share these credentials</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">Copy and give them to the user in person. They must change the password on first login.</p>
                </div>
              </div>
              <CredentialsDisplay credentials={createdCredentials} copiedField={copiedField} setCopiedField={setCopiedField} accentClass="indigo" />
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
            <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <UserIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
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
              {USER_CREATE_ROLE_OPTIONS.map(r => (
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

        {/* ── Onboarding Method ─────────────────────────────────────────── */}
        <fieldset disabled={submitting || success} className="space-y-4 pt-5 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
              Onboarding Method
            </legend>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {([
              {
                value: 'temp_password' as const,
                icon: <Info className="w-4 h-4" />,
                label: 'Send temporary password',
                desc: 'Auto-generate a password and email it to the user. They must change it on first login.',
              },
              {
                value: 'email_link' as const,
                icon: <Link2 className="w-4 h-4" />,
                label: 'Send activation link',
                desc: 'Email a one-time link. The user clicks it and sets their own password directly — no temp password needed.',
              },
              {
                value: 'manual' as const,
                icon: <Lock className="w-4 h-4" />,
                label: 'Set password manually',
                desc: 'You type a short password now and give it to the user in person. They must change it on first login.',
              },
            ] as const).map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  provisioningMethod === opt.value
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="provisioningMethod"
                  value={opt.value}
                  checked={provisioningMethod === opt.value}
                  onChange={() => { setProvisioningMethod(opt.value); setCustomPassword(''); }}
                  className="mt-0.5 accent-indigo-600"
                />
                <span className={`mt-0.5 flex-shrink-0 ${provisioningMethod === opt.value ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`}>
                  {opt.icon}
                </span>
                <div>
                  <p className={`text-sm font-medium ${provisioningMethod === opt.value ? 'text-indigo-800 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Manual password field */}
          {provisioningMethod === 'manual' && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Initial Password <span className="text-red-500">*</span>
                <span className="text-xs text-gray-400 font-normal ml-1">(min 4 characters)</span>
              </label>
              <div className="relative">
                <input
                  type={showCustomPw ? 'text' : 'password'}
                  value={customPassword}
                  onChange={e => setCustomPassword(e.target.value)}
                  placeholder="e.g. 1234 or Admin@123"
                  autoComplete="new-password"
                  className={`w-full px-4 py-2.5 pr-10 text-sm border rounded-lg transition-colors focus:ring-2 focus:outline-none
                    ${customPasswordError
                      ? 'border-red-300 dark:border-red-600 focus:ring-red-500 bg-red-50/50 dark:bg-red-900/10'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700'
                    }
                    text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500`}
                />
                <button
                  type="button"
                  onClick={() => setShowCustomPw(p => !p)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showCustomPw ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                </button>
              </div>
              {customPasswordError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {customPasswordError}
                </p>
              )}
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                This password is treated as temporary — the user must change it on first login.
              </p>
            </div>
          )}
        </fieldset>
      </form>
    </AccessibleModal>
  );
}
