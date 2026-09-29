import { useCallback, useEffect, useMemo, useState } from "react";
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

const COLORS = {
  bg: "#030309",
  panel: "#07070D",
  panelSoft: "#0A0810",
  border: "rgba(217,70,239,0.20)",
  borderStrong: "rgba(217,70,239,0.42)",
  purple: "#D946EF",
  purpleSoft: "#A855F7",
  amber: "#FBBF24",
  white: "#FFFFFF",
  text: "#F4F4F5",
  muted: "#71717A",
  muted2: "#A1A1AA",
  green: "#34D399",
  red: "#F87171",
};

function formatTimestamp(value?: string): string {
  if (!value) return "Ainda não recebido";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function firstName(name?: string) {
  return (name || "Mecânico").trim().split(/\s+/)[0] || "Mecânico";
}

function initials(name?: string) {
  return (name || "MC")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function dateLabel() {
  const raw = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type ActionCardProps = {
  icon: string;
  title: string;
  subtitle: string;
  accent?: "purple" | "amber" | "green" | "red";
  disabled?: boolean;
  onPress?: () => void;
  badge?: string;
};

function ActionCard({
  icon,
  title,
  subtitle,
  accent = "purple",
  disabled,
  onPress,
  badge,
}: ActionCardProps) {
  const accentColor =
    accent === "amber"
      ? COLORS.amber
      : accent === "green"
        ? COLORS.green
        : accent === "red"
          ? COLORS.red
          : COLORS.purple;

  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        disabled && styles.actionCardDisabled,
        pressed && styles.cardPressed,
      ]}
    >
      <Text style={[styles.actionIcon, { color: accentColor }]}>{icon}</Text>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={[styles.badgeText, { color: accentColor }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function SummaryItem({
  label,
  value,
  valueColor = COLORS.amber,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryDot}>
        <View style={styles.summaryDotInner} />
      </View>
      <View style={styles.summaryText}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={[styles.summaryValue, { color: valueColor }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
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
      "Durante a jornada, o TOPAC continuará usando sua localização com o aplicativo em segundo plano e com a tela bloqueada. O envio é usado exclusivamente para acompanhamento operacional.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Autorizar e iniciar", onPress: () => void beginTracking() },
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

  const confirmEndTracking = () => {
    Alert.alert(
      "Encerrar jornada e GPS",
      "Deseja encerrar o rastreamento deste aparelho agora?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Encerrar", style: "destructive", onPress: () => void endTracking() },
      ],
    );
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

  const confirmLogout = () => {
    Alert.alert("Sair deste aparelho", "Deseja encerrar o acesso neste aparelho?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void logout() },
    ]);
  };

  const statusText = trackingActive ? "GPS ativo" : "GPS parado";
  const lastAccepted = formatTimestamp(diagnostics.ultimoEnvioAceitoEm);
  const lastEvent = formatTimestamp(diagnostics.ultimoEventoEm);

  const platformText = useMemo(
    () =>
      Platform.OS === "android"
        ? "Android: o serviço permanece ativo em segundo plano com notificação do sistema."
        : "iPhone: usa localização em segundo plano com a permissão Sempre.",
    [],
  );

  if (booting) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <View style={styles.loadingLogo}>
          <Text style={styles.loadingLogoText}>T</Text>
        </View>
        <ActivityIndicator size="large" color={COLORS.purple} />
        <Text style={styles.loadingText}>Iniciando TOPAC...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.ambientTop} />
        <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
          <View style={styles.loginBrand}>
            <View style={styles.loginLogo}>
              <Text style={styles.loginLogoText}>T</Text>
            </View>
            <Text style={styles.loginTitle}>TOPAC</Text>
            <Text style={styles.loginSubtitle}>ACESSO OPERACIONAL</Text>
          </View>

          <View style={styles.loginCard}>
            {options.length === 0 ? (
              <>
                <Text style={styles.loginCardEyebrow}>ACESSO SEGURO</Text>
                <Text style={styles.loginCardTitle}>Entre pelo seu PIN</Text>
                <Text style={styles.loginHelper}>
                  Digite os quatro últimos números do CPF.
                </Text>

                <TextInput
                  value={pin}
                  onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  style={styles.pinInput}
                  editable={!busy}
                  placeholder="••••"
                  placeholderTextColor="#52525B"
                />

                <Pressable
                  disabled={busy || pin.length !== 4}
                  onPress={() => void submitPin()}
                  style={({ pressed }) => [
                    styles.loginButton,
                    (busy || pin.length !== 4) && styles.disabledButton,
                    pressed && styles.cardPressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.loginButtonText}>ENTRAR</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.loginCardEyebrow}>IDENTIFICAÇÃO</Text>
                <Text style={styles.loginCardTitle}>Selecione seu nome</Text>
                <View style={styles.optionList}>
                  {options.map((option) => (
                    <Pressable
                      key={option.id}
                      disabled={busy}
                      onPress={() => void loginWithOption(option)}
                      style={({ pressed }) => [
                        styles.optionButton,
                        pressed && styles.cardPressed,
                      ]}
                    >
                      <View style={styles.optionAvatar}>
                        <Text style={styles.optionAvatarText}>{initials(option.nome)}</Text>
                      </View>
                      <View style={styles.optionText}>
                        <Text style={styles.optionName}>{option.nome}</Text>
                        <Text style={styles.optionMeta} numberOfLines={1}>
                          {[option.empresa, option.filial, option.funcao]
                            .filter(Boolean)
                            .join(" • ")}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setOptions([])} style={styles.backButton}>
                  <Text style={styles.backButtonText}>Voltar</Text>
                </Pressable>
              </>
            )}

            {errorMessage ? (
              <View style={styles.errorPanel}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.loginFooter}>TOPAC • OPERAÇÃO EM CAMPO</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.ambientTop} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.greeting}>
              {greeting()}, <Text style={styles.greetingName}>{firstName(session.nome)}</Text>
            </Text>
            <Text style={styles.dateText}>{dateLabel()}</Text>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.bellButton}>
              <Text style={styles.bellIcon}>◌</Text>
              <View style={styles.notificationDot} />
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(session.nome)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionIcon}>⌁</Text>
            <Text style={styles.sectionTitle}>TOPAC FIELD</Text>
          </View>
          <Text style={styles.sectionMeta}>Operação</Text>
        </View>

        <View style={styles.actionGrid}>
          <ActionCard
            icon={trackingActive ? "■" : "↗"}
            title={trackingActive ? "Jornada / GPS ativo" : "Iniciar Jornada"}
            subtitle={
              trackingActive
                ? "Localização contínua em execução"
                : "Inicie a jornada e o rastreamento"
            }
            accent={trackingActive ? "green" : "purple"}
            badge={trackingActive ? "ATIVO" : undefined}
            onPress={trackingActive ? confirmEndTracking : confirmBeginTracking}
          />
          <ActionCard
            icon="⌖"
            title="Localização"
            subtitle="Permissões e ajustes do aparelho"
            onPress={() => void Linking.openSettings()}
          />
          <ActionCard
            icon="◎"
            title="Último Sinal"
            subtitle={diagnostics.ultimoEnvioAceitoEm ? lastAccepted : "Nenhum sinal recebido"}
            accent={diagnostics.ultimoEnvioAceitoEm ? "amber" : "purple"}
          />
          <ActionCard
            icon="≋"
            title="Diagnóstico"
            subtitle={diagnostics.ultimoErro ? "Atenção necessária" : "Serviço sem alerta local"}
            accent={diagnostics.ultimoErro ? "red" : "purple"}
            badge={diagnostics.ultimoErro ? "VERIFICAR" : undefined}
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelTitleWrap}>
              <Text style={styles.panelIcon}>▣</Text>
              <Text style={styles.panelTitle}>RESUMO DO APARELHO</Text>
            </View>
            <Text style={styles.panelMeta}>Dados atuais</Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryColumn}>
              <SummaryItem
                label="Status da jornada"
                value={trackingActive ? "Em andamento" : "Não iniciada"}
                valueColor={trackingActive ? COLORS.green : COLORS.amber}
              />
              <SummaryItem label="Último evento" value={lastEvent} />
            </View>
            <View style={[styles.summaryColumn, styles.summaryColumnRight]}>
              <SummaryItem
                label="Localização"
                value={statusText}
                valueColor={trackingActive ? COLORS.green : COLORS.red}
              />
              <SummaryItem label="Último envio aceito" value={lastAccepted} />
            </View>
          </View>
        </View>

        {errorMessage || diagnostics.ultimoErro ? (
          <View style={styles.alertPanel}>
            <View style={styles.alertHeader}>
              <Text style={styles.alertIcon}>!</Text>
              <Text style={styles.alertTitle}>ATENÇÃO NO APARELHO</Text>
            </View>
            <Text style={styles.alertText}>{errorMessage || diagnostics.ultimoErro}</Text>
            <Pressable onPress={() => void Linking.openSettings()} style={styles.alertButton}>
              <Text style={styles.alertButtonText}>ABRIR CONFIGURAÇÕES</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelTitleWrap}>
              <Text style={styles.panelIcon}>i</Text>
              <Text style={styles.panelTitle}>FUNCIONAMENTO</Text>
            </View>
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoText}>{platformText}</Text>
            <View style={styles.infoDivider} />
            <Text style={styles.deviceMeta}>
              {[session.empresa, session.filial, session.funcao]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem}>
          <Text style={[styles.navIcon, styles.navActive]}>⌂</Text>
          <Text style={[styles.navLabel, styles.navActive]}>Início</Text>
        </Pressable>

        <View style={styles.navItem}>
          <Text style={styles.navIcon}>◴</Text>
          <Text style={styles.navLabel}>Status</Text>
        </View>

        <Pressable
          disabled={busy}
          onPress={trackingActive ? confirmEndTracking : confirmBeginTracking}
          style={styles.navCenterWrap}
        >
          <View
            style={[
              styles.navCenter,
              trackingActive && styles.navCenterActive,
              busy && styles.disabledButton,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.navCenterIcon}>{trackingActive ? "■" : "⌖"}</Text>
            )}
          </View>
          <Text style={styles.navCenterLabel}>{trackingActive ? "Encerrar" : "GPS"}</Text>
        </Pressable>

        <Pressable onPress={() => void Linking.openSettings()} style={styles.navItem}>
          <Text style={styles.navIcon}>⚙</Text>
          <Text style={styles.navLabel}>Aparelho</Text>
        </Pressable>

        <Pressable onPress={confirmLogout} style={styles.navItem}>
          <Text style={styles.navIcon}>≡</Text>
          <Text style={styles.navLabel}>Mais</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  ambientTop: {
    position: "absolute",
    top: -110,
    right: -95,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: "rgba(88,28,135,0.12)",
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: COLORS.bg,
  },
  loadingLogo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.panel,
  },
  loadingLogoText: {
    color: COLORS.amber,
    fontSize: 28,
    fontWeight: "900",
  },
  loadingText: {
    color: COLORS.muted2,
    fontSize: 13,
    fontWeight: "600",
  },

  loginContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  loginBrand: {
    alignItems: "center",
    marginBottom: 28,
  },
  loginLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.panel,
    shadowColor: COLORS.purple,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  loginLogoText: {
    color: COLORS.amber,
    fontSize: 32,
    fontWeight: "900",
  },
  loginTitle: {
    marginTop: 14,
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  loginSubtitle: {
    marginTop: 4,
    color: COLORS.purple,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.1,
  },
  loginCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(7,7,13,0.96)",
    padding: 18,
  },
  loginCardEyebrow: {
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  loginCardTitle: {
    marginTop: 7,
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
  },
  loginHelper: {
    marginTop: 6,
    color: COLORS.muted2,
    fontSize: 12,
    lineHeight: 18,
  },
  pinInput: {
    height: 62,
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 16,
    color: COLORS.white,
    textAlign: "center",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: 15,
    backgroundColor: "#05050A",
  },
  loginButton: {
    minHeight: 54,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#7E22CE",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.purple,
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  optionList: {
    marginTop: 16,
    gap: 8,
  },
  optionButton: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: "#05050A",
  },
  optionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  optionAvatarText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "900",
  },
  optionText: {
    flex: 1,
  },
  optionName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
  },
  optionMeta: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 10,
  },
  backButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  backButtonText: {
    color: COLORS.purple,
    fontWeight: "800",
  },
  loginFooter: {
    marginTop: 22,
    textAlign: "center",
    color: "#3F3F46",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  content: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 122,
    gap: 14,
  },
  header: {
    minHeight: 72,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  greeting: {
    color: COLORS.white,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  greetingName: {
    color: COLORS.amber,
  },
  dateText: {
    marginTop: 5,
    color: COLORS.muted,
    fontSize: 12,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panel,
  },
  bellIcon: {
    color: COLORS.white,
    fontSize: 25,
    lineHeight: 25,
  },
  notificationDot: {
    position: "absolute",
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.purple,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.panelSoft,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "900",
  },

  sectionHeader: {
    height: 26,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sectionIcon: {
    color: COLORS.amber,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },
  sectionMeta: {
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: "800",
  },

  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionCard: {
    width: "48.8%",
    minHeight: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    paddingHorizontal: 11,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  actionIcon: {
    width: 35,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "300",
    textAlign: "center",
  },
  actionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: COLORS.white,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  actionSubtitle: {
    marginTop: 4,
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 12,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: 7,
    backgroundColor: "rgba(168,85,247,0.10)",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  chevron: {
    color: "#52525B",
    fontSize: 22,
    fontWeight: "300",
  },

  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.panel,
  },
  panelHeader: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(217,70,239,0.10)",
  },
  panelTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  panelIcon: {
    color: COLORS.purple,
    fontSize: 15,
    fontWeight: "900",
  },
  panelTitle: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "900",
  },
  panelMeta: {
    color: "#52525B",
    fontSize: 8,
  },
  summaryGrid: {
    flexDirection: "row",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  summaryColumn: {
    flex: 1,
    paddingRight: 8,
  },
  summaryColumnRight: {
    paddingRight: 0,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(217,70,239,0.10)",
  },
  summaryItem: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(217,70,239,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.purple,
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 9,
  },
  summaryValue: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "900",
  },

  alertPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.30)",
    backgroundColor: "rgba(127,29,29,0.10)",
    padding: 13,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    color: COLORS.red,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
    fontWeight: "900",
  },
  alertTitle: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "900",
  },
  alertText: {
    marginTop: 9,
    color: "#FCA5A5",
    fontSize: 11,
    lineHeight: 16,
  },
  alertButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.26)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alertButtonText: {
    color: COLORS.red,
    fontSize: 9,
    fontWeight: "900",
  },

  infoBody: {
    padding: 13,
  },
  infoText: {
    color: COLORS.muted2,
    fontSize: 11,
    lineHeight: 17,
  },
  infoDivider: {
    height: 1,
    marginVertical: 11,
    backgroundColor: "rgba(217,70,239,0.08)",
  },
  deviceMeta: {
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 14,
  },

  errorPanel: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.28)",
    backgroundColor: "rgba(127,29,29,0.10)",
    padding: 11,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 11,
    lineHeight: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },

  bottomNav: {
    position: "absolute",
    left: 9,
    right: 9,
    bottom: 8,
    minHeight: 82,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(7,7,13,0.98)",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingBottom: 8,
    paddingTop: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
  },
  navItem: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  navIcon: {
    color: COLORS.muted,
    fontSize: 22,
    lineHeight: 24,
  },
  navLabel: {
    color: COLORS.muted,
    fontSize: 8,
  },
  navActive: {
    color: COLORS.purple,
  },
  navCenterWrap: {
    flex: 1.15,
    minHeight: 66,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  navCenter: {
    width: 58,
    height: 58,
    marginTop: -20,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "#E879F9",
    backgroundColor: "#260A34",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.purple,
    shadowOpacity: 0.50,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  navCenterActive: {
    borderColor: COLORS.green,
    shadowColor: COLORS.green,
    backgroundColor: "#052E2A",
  },
  navCenterIcon: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: "900",
  },
  navCenterLabel: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 8,
  },
});