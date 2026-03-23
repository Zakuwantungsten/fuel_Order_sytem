export type SettingsTelemetryAction = 'load' | 'save';
export type SettingsTelemetryStatus = 'success' | 'error';

export interface SettingsTelemetryEvent {
  domain: string;
  key: string;
  action: SettingsTelemetryAction;
  status: SettingsTelemetryStatus;
  durationMs: number;
  requestId?: string;
  message?: string;
  timestamp: string;
}

const EVENT_NAME = 'superadmin:settings-telemetry';

const extractRequestId = (value: unknown): string | undefined => {
  const maybeObj = value as any;
  return maybeObj?.requestId || maybeObj?.response?.data?.requestId;
};

export const emitSettingsTelemetry = (event: SettingsTelemetryEvent): void => {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
  } catch {
    // no-op: event dispatch should never break UX
  }

  if (import.meta.env.DEV) {
    console.debug('[settings-telemetry]', event);
  }
};

export const measureSettingsAction = async <T>(
  domain: string,
  key: string,
  action: SettingsTelemetryAction,
  run: () => Promise<T>
): Promise<T> => {
  const startedAt = performance.now();

  try {
    const result = await run();
    emitSettingsTelemetry({
      domain,
      key,
      action,
      status: 'success',
      durationMs: Math.round(performance.now() - startedAt),
      requestId: extractRequestId(result),
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (error: any) {
    emitSettingsTelemetry({
      domain,
      key,
      action,
      status: 'error',
      durationMs: Math.round(performance.now() - startedAt),
      requestId: extractRequestId(error),
      message: error?.response?.data?.message || error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};
