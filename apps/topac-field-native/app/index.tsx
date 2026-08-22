import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  enterMechanicSession,
  type MechanicPinOption,
  validateMechanicPin,
} from "@/auth/mechanicAuth";
import {
  isContinuousTrackingActive,
  startContinuousTracking,
  stopContinuousTracking,
} from "@/location/trackingController";
import {
  clearMechanicSession,
  getLocationDiagnostics,
  getMechanicSession,
  type LocationDiagnostics,
  type MechanicSession,
  registerLocationConsent,
} from "@/session/mechanicSession";

function formatTimestamp(value?: string): string {
  if (!value) return "Ainda não recebido";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

export default function HomeScreen() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [options, setOptions] = useState<MechanicPinOption[]>([]);
  const [session, setSession] = useState<MechanicSession | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [diagnostics, setDiagnostics] = useState<LocationDiagnostics>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const [savedSession, active, savedDiagnostics] = await Promise.all([
      getMechanicSession(),
      isContinuousTrackingActive().catch(() => false),
      getLocationDiagnostics(),
    ]);
    setSession(savedSession);
    setTrackingActive(active);
    setDiagnostics(savedDiagnostics);
  }, []);

  useEffect(() => {
    void refreshStatus().finally(() => setBooting(false));

    const interval = setInterval(() => {
      void refreshStatus();
    }, 5_000);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshStatus();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshStatus]);

  const loginWithOption = async (option: MechanicPinOption) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const nextSession = await enterMechanicSession(option.id);
      setSession(nextSession);
      setOptions([]);
      setPin("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Falha ao entrar no TOPAC Field.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await validateMechanicPin(pin);
      if (result.length === 1 && result[0]) {
        await loginWithOption(result[0]);
        return;
      }
      setOptions(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível validar o PIN.",
      );
    } finally {
      setBusy(false);
    }
  };

  const beginTracking = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await registerLocationConsent();
      await startContinuousTracking();
      await refreshStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o serviço nativo de localização.",
      );
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const confirmBeginTracking = () => {
    Alert.alert(
      "Ativar localização contínua",
      "Durante a jornada, o TOPAC Field continuará usando sua localização com o aplicativo em segundo plano e com a tela bloqueada. No Android haverá uma notificação permanente; no iPhone aparecerá o indicador de localização. O envio é usado exclusivamente para acompanhamento operacional.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Autorizar e iniciar",
          onPress: () => void beginTracking(),
        },
      ],
    );
  };

  const endTracking = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await stopContinuousTracking();
      await refreshStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível encerrar o rastreamento.",
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await stopContinuousTracking();
      await clearMechanicSession();
      setSession(null);
      setTrackingActive(false);
      setDiagnostics({});
      setOptions([]);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Iniciando TOPAC Field...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.centeredContent}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>TF</Text>
          </View>
          <Text style={styles.title}>TOPAC Field</Text>
          <Text style={styles.subtitle}>Aplicativo nativo dos mecânicos</Text>

          <View style={styles.card}>
            {options.length === 0 ? (
              <>
                <Text style={styles.cardTitle}>Acesso pelo PIN</Text>
                <Text style={styles.helperText}>
                  Digite os quatro últimos números do CPF.
                </Text>
                <TextInput
                  value={pin}
                  onChangeText={(value) =>
                    setPin(value.replace(/\D/g, "").slice(0, 4))
                  }
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  style={styles.pinInput}
                  editable={!busy}
                  placeholder="••••"
                  placeholderTextColor="#94A3B8"
                />
                <Pressable
                  disabled={busy || pin.length !== 4}
                  onPress={() => void submitPin()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (busy || pin.length !== 4) && styles.disabledButton,
                    pressed && styles.pressedButton,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Entrar</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Selecione seu nome</Text>
                {options.map((option) => (
                  <Pressable
                    key={option.id}
                    disabled={busy}
                    onPress={() => void loginWithOption(option)}
                    style={styles.optionButton}
                  >
                    <Text style={styles.optionName}>{option.nome}</Text>
                    <Text style={styles.optionMeta}>
                      {[option.empresa, option.filial, option.funcao]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setOptions([])}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Voltar</Text>
                </Pressable>
              </>
            )}

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>TOPAC Field</Text>
            <Text style={styles.titleSmall}>{session.nome}</Text>
            <Text style={styles.subtitleSmall}>
              {[session.empresa, session.filial, session.funcao]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              trackingActive ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {trackingActive ? "GPS ATIVO" : "GPS PARADO"}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rastreamento operacional nativo</Text>
          <Text style={styles.bodyText}>
            {trackingActive
              ? "O serviço continua ativo com o celular no bolso, aplicativo em segundo plano e tela bloqueada."
              : "Inicie o serviço ao começar a jornada. A localização só será enviada após sua autorização."}
          </Text>

          <View style={styles.diagnosticsBox}>
            <Text style={styles.diagnosticLabel}>Último evento do aparelho</Text>
            <Text style={styles.diagnosticValue}>
              {formatTimestamp(diagnostics.ultimoEventoEm)}
            </Text>
            <Text style={styles.diagnosticLabel}>Último sinal aceito</Text>
            <Text style={styles.diagnosticValue}>
              {formatTimestamp(diagnostics.ultimoEnvioAceitoEm)}
            </Text>
          </View>

          {trackingActive ? (
            <Pressable
              disabled={busy}
              onPress={() => void endTracking()}
              style={[styles.stopButton, busy && styles.disabledButton]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Encerrar jornada e GPS
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              disabled={busy}
              onPress={confirmBeginTracking}
              style={[styles.primaryButton, busy && styles.disabledButton]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Iniciar jornada e GPS
                </Text>
              )}
            </Pressable>
          )}

          {errorMessage || diagnostics.ultimoErro ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {errorMessage || diagnostics.ultimoErro}
              </Text>
              <Pressable
                onPress={() => void Linking.openSettings()}
                style={styles.settingsButton}
              >
                <Text style={styles.settingsButtonText}>
                  Abrir configurações do aparelho
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Comportamento por plataforma</Text>
          <Text style={styles.noticeText}>
            {Platform.OS === "android"
              ? "Android: o serviço usa Foreground Service e exibe uma notificação permanente enquanto estiver ativo."
              : "iPhone: o serviço usa Core Location, permissão Sempre e modo de localização em background."}
          </Text>
        </View>

        <Pressable disabled={busy} onPress={() => void logout()}>
          <Text style={styles.logoutText}>Sair deste aparelho</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#07111F" },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#07111F",
  },
  loadingText: { color: "#CBD5E1", fontSize: 15 },
  centeredContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  content: { padding: 20, gap: 16 },
  brandBadge: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  brandBadgeText: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  cardTitle: { color: "#0F172A", fontSize: 19, fontWeight: "800" },
  helperText: { color: "#64748B", fontSize: 14 },
  pinInput: {
    height: 58,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    color: "#0F172A",
    textAlign: "center",
    fontSize: 26,
    letterSpacing: 14,
    backgroundColor: "#F8FAFC",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  stopButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#B91C1C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  disabledButton: { opacity: 0.5 },
  pressedButton: { transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#0F766E", fontWeight: "700" },
  optionButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  optionName: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  optionMeta: { color: "#64748B", fontSize: 13 },
  errorText: { color: "#B91C1C", fontSize: 14, lineHeight: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  eyebrow: {
    color: "#2DD4BF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  titleSmall: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 4 },
  subtitleSmall: { color: "#94A3B8", fontSize: 13, marginTop: 4, maxWidth: 230 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusActive: { backgroundColor: "#065F46" },
  statusInactive: { backgroundColor: "#475569" },
  statusBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  bodyText: { color: "#475569", fontSize: 15, lineHeight: 22 },
  diagnosticsBox: {
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  diagnosticLabel: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  diagnosticValue: { color: "#0F172A", fontSize: 14, marginBottom: 8 },
  errorBox: {
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    padding: 14,
    gap: 10,
  },
  settingsButton: { alignSelf: "flex-start" },
  settingsButtonText: { color: "#991B1B", fontWeight: "800" },
  noticeCard: {
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0F1B2D",
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  noticeTitle: { color: "#E2E8F0", fontWeight: "800" },
  noticeText: { color: "#94A3B8", lineHeight: 20 },
  logoutText: {
    color: "#94A3B8",
    textAlign: "center",
    paddingVertical: 18,
    fontWeight: "700",
  },
});
