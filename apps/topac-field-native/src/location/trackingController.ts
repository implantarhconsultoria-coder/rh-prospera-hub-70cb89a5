import * as Location from "expo-location";
import { Platform } from "react-native";
import { TOPAC_BACKGROUND_LOCATION_TASK } from "./backgroundLocationTask";
import { publishLocation } from "./locationPublisher";
import {
  getMechanicSession,
  saveLocationDiagnostics,
} from "../session/mechanicSession";

export interface NativePermissionState {
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  canAskForegroundAgain: boolean;
  canAskBackgroundAgain: boolean;
}

export async function getNativePermissionState(): Promise<NativePermissionState> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);

  return {
    foregroundGranted: foreground.granted,
    backgroundGranted: background.granted,
    canAskForegroundAgain: foreground.canAskAgain,
    canAskBackgroundAgain: background.canAskAgain,
  };
}

export async function requestContinuousLocationPermissions(): Promise<void> {
  const available = await Location.isBackgroundLocationAvailableAsync();
  if (!available) {
    throw new Error(
      "Este aparelho não disponibiliza localização contínua em segundo plano.",
    );
  }

  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    foreground = await Location.requestForegroundPermissionsAsync();
  }

  if (!foreground.granted) {
    throw new Error(
      "Autorize a localização precisa enquanto o TOPAC Field estiver em uso.",
    );
  }

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    background = await Location.requestBackgroundPermissionsAsync();
  }

  if (!background.granted) {
    throw new Error(
      Platform.OS === "ios"
        ? "Selecione Sempre Permitir nas configurações de localização do TOPAC Field."
        : "Selecione Permitir o tempo todo nas configurações de localização do TOPAC Field.",
    );
  }
}

export async function isContinuousTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(
    TOPAC_BACKGROUND_LOCATION_TASK,
  );
}

export async function startContinuousTracking(): Promise<void> {
  const session = await getMechanicSession();
  if (!session) {
    throw new Error("Entre no TOPAC Field antes de iniciar o rastreamento.");
  }

  await requestContinuousLocationPermissions();

  const alreadyStarted = await isContinuousTrackingActive();
  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(TOPAC_BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 100,
      timeInterval: 60_000,
      deferredUpdatesDistance: 100,
      deferredUpdatesInterval: 60_000,
      deferredUpdatesTimeout: 60_000,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "TOPAC Field — GPS ativo",
        notificationBody:
          "Acompanhamento operacional em andamento. Toque para abrir o app.",
        notificationColor: "#0F766E",
        killServiceOnDestroy: false,
      },
    });
  }

  await saveLocationDiagnostics({
    rastreamentoAtivo: true,
    ultimoErro: undefined,
  });

  try {
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    await publishLocation(initialLocation, "native_foreground");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "O serviço iniciou, mas o primeiro sinal ainda não foi enviado.";
    await saveLocationDiagnostics({ ultimoErro: message });
  }
}

export async function stopContinuousTracking(): Promise<void> {
  const started = await isContinuousTrackingActive();
  if (started) {
    await Location.stopLocationUpdatesAsync(TOPAC_BACKGROUND_LOCATION_TASK);
  }

  await saveLocationDiagnostics({ rastreamentoAtivo: false });
}
