import { useMemo } from 'react';

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

  const monitoringScope = useMemo(
    () => getMonitoringScopePreferences(currentUserQuery.data?.preferences),
    [currentUserQuery.data?.preferences],
  );

  const persistMonitoringScope = async (nextScope: MonitoringScopePreferences) => {
    await updatePreferencesMutation.mutateAsync({
      preferences: buildMonitoringScopePreferencesPayload(
        currentUserQuery.data?.preferences,
        nextScope,
      ),
    });
  };

  return {
    currentUserQuery,
    monitoringScope,
    persistMonitoringScope,
    updatePreferencesMutation,
  };
}
