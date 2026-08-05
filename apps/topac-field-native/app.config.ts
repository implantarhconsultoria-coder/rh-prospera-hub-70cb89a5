import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "TOPAC Field",
  slug: "topac-field",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "topacfield",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "br.com.implantarh.topacfield",
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ["location"],
    },
  },
  android: {
    package: "br.com.implantarh.topacfield",
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
  },
  plugins: [
    "expo-router",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "O TOPAC Field usa sua localização durante o trabalho para registrar o atendimento operacional.",
        locationAlwaysAndWhenInUsePermission:
          "O TOPAC Field precisa acessar sua localização mesmo com a tela bloqueada para manter o acompanhamento operacional ativo.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
};

export default config;
