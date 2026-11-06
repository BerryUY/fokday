import {
  StackSansHeadline_400Regular,
  StackSansHeadline_500Medium,
  StackSansHeadline_600SemiBold,
  StackSansHeadline_700Bold,
  useFonts,
} from '@expo-google-fonts/stack-sans-headline';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAccount } from '@/auth/account';
import { startBackupService } from '@/backup/service';
import { refreshPlan, syncPurchasesAccount, usePro } from '@/billing/pro';
import { LaunchAnimation } from '@/components/brand/LaunchAnimation';
import { StreakCelebration, StreakNotice } from '@/components/streak';
import { SummaryNotice } from '@/components/SummaryNotice';
import { DialogHost } from '@/components/ui/dialog';
import { PortalProvider } from '@/components/ui/portal';
import { getProfile, type ThemePreference } from '@/data/settings';
import { NotificationRouter } from '@/notifications/NotificationRouter';
import { applyReminders } from '@/notifications/schedule';
import { openAppDatabase } from '@/db/client';
import type { Db } from '@/db/types';
import { DbProvider, useDataVersion, useDb } from '@/state/db';
import { ToastProvider } from '@/state/toast';
import { ThemeProvider, useColors } from '@/theme/ThemeProvider';
import type { AccentKey } from '@/theme/tokens';
import { setSoundsEnabled } from '@/lib/sound';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ StackSansHeadline_400Regular, StackSansHeadline_500Medium, StackSansHeadline_600SemiBold, StackSansHeadline_700Bold, JetBrainsMono_700Bold });
  const [db, setDb] = useState<Db | null>(null);
  const [dbError, setDbError] = useState<Error | null>(null);

  useEffect(() => {
    openAppDatabase().then(setDb).catch((e: Error) => setDbError(e));
  }, []);

  useEffect(() => {
    if (db) return startBackupService(db);
  }, [db]);

  const ready = (fontsLoaded || !!fontError) && (!!db || !!dbError);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  if (dbError || !db) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#09090A' }} contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
        <Text style={{ color: '#F5F5F4', fontSize: 22, fontWeight: '700', marginBottom: 12 }}>No se pudo abrir la base de datos</Text>
        <Text style={{ color: '#A1A1A6', fontSize: 15, lineHeight: 22 }}>
          Tus datos no se modificaron. Cerrá y volvé a abrir la app. Si el problema sigue, instalá la última versión del APK.
        </Text>
        <Text style={{ color: '#6B6B72', fontSize: 13, marginTop: 20 }}>{dbError?.message}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaProvider>
      <DbProvider db={db}>
        <ThemedApp />
      </DbProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const db = useDb();
  const version = useDataVersion();
  const [preference, setPreference] = useState<ThemePreference>('dark');
  const [accent, setAccent] = useState<AccentKey>('lima');
  const { account, loading } = useAccount();
  const pro = usePro();
  const [launching, setLaunching] = useState(true);
  const launched = useCallback(() => setLaunching(false), []);

  useEffect(() => {
    getProfile(db)
      .then((p) => {
        setPreference(p.theme);
        setAccent(p.accent);
        setSoundsEnabled(p.sounds);
      })
      .catch(() => {});
  }, [db, version]);

  // Purchases and plan follow the signed-in account.
  useEffect(() => {
    if (loading) return;
    void syncPurchasesAccount(account?.id ?? null).then(refreshPlan);
  }, [account?.id, loading]);

  // Keeps scheduled reminders in line with the settings (skipped when nothing changed).
  useEffect(() => {
    const timer = setTimeout(() => void applyReminders(db).catch(() => {}), 1500);
    return () => clearTimeout(timer);
  }, [db, version]);

  return (
    <ThemeProvider preference={preference} accent={pro ? accent : 'lima'}>
      {/* Layers, bottom to top: screens → sheets → dialogs → toasts (ToastProvider draws last). */}
      <ToastProvider>
        <PortalProvider>
          <Navigator />
          <StreakCelebration enabled={!launching} />
          <StreakNotice enabled={!launching} />
          <SummaryNotice />
          <DialogHost />
        </PortalProvider>
      </ToastProvider>
      {/* Same background as the native splash, so the hand-off is seamless. */}
      {launching ? <LaunchAnimation background="#0B0C0E" onDone={launched} /> : null}
    </ThemeProvider>
  );
}

function Navigator() {
  const c = useColors();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="bienvenida" options={{ gestureEnabled: false }} />
        <Stack.Screen name="sesion/activa" options={{ gestureEnabled: false }} />
        <Stack.Screen name="tour" options={{ animation: 'fade_from_bottom' }} />
      </Stack>
      {Platform.OS !== 'web' ? <NotificationRouter /> : null}
    </View>
  );
}
