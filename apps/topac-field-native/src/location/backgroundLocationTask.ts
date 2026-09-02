import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import {
  flushPendingLocation,
  publishLocation,
} from "./locationPublisher";
import { saveLocationDiagnostics } from "../session/mechanicSession";

export const TOPAC_BACKGROUND_LOCATION_TASK =
  "topac-field-continuous-location-v1";

interface BackgroundLocationTaskData {
  locations?: LocationObject[];
}

TaskManager.defineTask(
  TOPAC_BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      await saveLocationDiagnostics({ ultimoErro: error.message });
      return;
    }

    const payload = (data ?? {}) as BackgroundLocationTaskData;
    const locations = payload.locations ?? [];
    const latestLocation = locations[locations.length - 1];
    if (!latestLocation) return;

    try {
      await flushPendingLocation();
      await publishLocation(latestLocation, "native_background");
    } catch (taskError) {
      const message =
        taskError instanceof Error
          ? taskError.message
          : "Falha desconhecida na tarefa nativa de localização.";
      await saveLocationDiagnostics({ ultimoErro: message });
    }
  },
);
