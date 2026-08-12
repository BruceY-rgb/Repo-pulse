import { apiClient } from './api-client';
import type { ApiResponse, EventAnalysis } from '@/types/api';
import { eventService } from './event.service';

async function fetchEventsById(eventIds: string[]) {
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
  const results = await Promise.allSettled(
    uniqueEventIds.map(async (eventId) => ({
      eventId,
      event: await eventService.getById(eventId),
    })),
  );

  return new Map(
    results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => [result.value.eventId, result.value.event]),
  );
}

async function hydrateMissingEventContext<T extends EventAnalysis>(
  analyses: T[],
): Promise<T[]> {
  const missingEventIds = analyses
    .filter((analysis) => !analysis.event && analysis.eventId)
    .map((analysis) => analysis.eventId);

  if (missingEventIds.length === 0) {
    return analyses;
  }

  const eventsById = await fetchEventsById(missingEventIds);
  return analyses.map((analysis) => ({
    ...analysis,
    event: analysis.event ?? eventsById.get(analysis.eventId) ?? null,
  }));
}

export const analysisService = {
  async getByEventId(eventId: string): Promise<EventAnalysis | null> {
    const { data } = await apiClient.get<
      ApiResponse<{ status: string; analysis: EventAnalysis | null }>
    >(`/ai/analysis/${eventId}`);
    const analysis = data.data.analysis;
    if (!analysis) {
      return null;
    }

    const [hydrated] = await hydrateMissingEventContext([analysis]);
    return hydrated;
  },

  async triggerAnalysis(
    eventId: string,
    force = false,
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<
      ApiResponse<{ success: boolean }>
    >(`/ai/trigger/${eventId}`, { force });
    return data.data;
  },

};
