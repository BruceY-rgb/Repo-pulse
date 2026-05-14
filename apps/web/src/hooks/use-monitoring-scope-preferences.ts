import { useCallback, useMemo, useRef } from 'react';

import {
  useCurrentUserQuery,
  useUpdateUserPreferencesMutation,
} from '@/hooks/queries/use-auth-queries';
import {
  buildMonitoringScopePreferencesPayload,
  getMonitoringScopePreferences,
} from '@/lib/monitoring-scope';
import type { MonitoringScopePreferences } from '@/types/api';

export function useMonitoringScopePreferences() {
  const currentUserQuery = useCurrentUserQuery();
  const updatePreferencesMutation = useUpdateUserPreferencesMutation();
  const lastNetworkFailureAtRef = useRef(0);

  const monitoringScope = useMemo(
    () => getMonitoringScopePreferences(currentUserQuery.data?.preferences),
    [currentUserQuery.data?.preferences],
  );

  const persistMonitoringScope = useCallback(async (nextScope: MonitoringScopePreferences) => {
    if (!currentUserQuery.data || updatePreferencesMutation.isPending) {
      return;
    }

    const now = Date.now();
    if (now - lastNetworkFailureAtRef.current < 10_000) {
      return;
    }

    try {
      await updatePreferencesMutation.mutateAsync({
        preferences: buildMonitoringScopePreferencesPayload(
          currentUserQuery.data.preferences,
          nextScope,
        ),
      });
    } catch (error) {
      if (typeof updatePreferencesMutation.error?.statusCode === 'undefined') {
        lastNetworkFailureAtRef.current = now;
      }
      throw error;
    }
  }, [currentUserQuery.data, updatePreferencesMutation]);

  return {
    currentUserQuery,
    monitoringScope,
    persistMonitoringScope,
    updatePreferencesMutation,
  };
}
