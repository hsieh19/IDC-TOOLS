import type Plausible from 'plausible-tracker';
import { inject } from 'vue';

export { createTrackerService, useTracker };

function createTrackerService({ plausible }: { plausible?: ReturnType<typeof Plausible> }) {
  return {
    trackEvent({ eventName }: { eventName: string }) {
      if (plausible) {
        plausible.trackEvent(eventName);
      }
    },
  };
}

function useTracker() {
  const plausible = inject<ReturnType<typeof Plausible> | undefined>('plausible', undefined);
  const tracker = createTrackerService({ plausible: plausible ?? undefined });

  return {
    tracker,
  };
}
