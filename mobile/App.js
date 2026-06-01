import React, { useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, Poppins_900Black } from '@expo-google-fonts/poppins';

import HomeScreen from './src/screens/HomeScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import GameScreen from './src/screens/GameScreen';
import RoundCompleteScreen from './src/screens/RoundCompleteScreen';
import GameOverScreen from './src/screens/GameOverScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DailyChallengeScreen from './src/screens/DailyChallengeScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import QuizScreen from './src/screens/QuizScreen';
import LevelsScreen from './src/screens/LevelsScreen';
import AuthScreen from './src/screens/AuthScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import AgeBlockedScreen from './src/screens/AgeBlockedScreen';
import TierLeaderboardScreen from './src/screens/TierLeaderboardScreen';
import TierUpScreen from './src/screens/TierUpScreen';
import BattleQueueScreen from './src/screens/BattleQueueScreen';
import BattleScreen from './src/screens/BattleScreen';
import BattleResultScreen from './src/screens/BattleResultScreen';
import LearningPathScreen from './src/screens/LearningPathScreen';
import LessonScreen from './src/screens/LessonScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import ProMaxHubScreen from './src/screens/ProMaxHubScreen';
import TutorScreen from './src/screens/TutorScreen';
import ParentDashboardScreen from './src/screens/ParentDashboardScreen';
import AvatarScreen from './src/screens/AvatarScreen';
import { AuthProvider } from './src/utils/auth';
import { PlanProvider } from './src/utils/plan';
import AnimatedSplash from './src/components/AnimatedSplash';
import { SettingsProvider, useSettings } from './src/utils/settings';
import { ThemeProvider, THEMES } from './src/utils/theme';
import { useAuth } from './src/utils/auth';

const Stack = createStackNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#070b14', card: '#070b14',
    text: '#ffffff', border: '#1f2937', primary: '#22c55e',
  },
};

function Navigator() {
  const { settings, ready } = useSettings();
  const { user, ready: authReady, configured } = useAuth();
  const [statsOnboardingSeen, setStatsOnboardingSeen] = React.useState(null);

  // Re-load the per-user onboarding flag whenever auth state changes so
  // returning users skip onboarding while brand-new accounts see it once.
  React.useEffect(() => {
    let cancelled = false;
    if (!authReady) return undefined;
    // eslint-disable-next-line global-require
    const { loadStats } = require('./src/utils/storage');
    (async () => {
      const s = await loadStats();
      if (!cancelled) setStatsOnboardingSeen(!!s?.hasSeenOnboarding);
    })();
    return () => { cancelled = true; };
  }, [authReady, user?.id]);

  if (!ready || !authReady || statsOnboardingSeen === null) return null;

  // Decide entry point:
  //   - Supabase configured + not signed in  → Auth
  //   - Signed in but onboarding never seen  → Onboarding
  //   - Else                                 → Home
  let initialRoute = 'Home';
  if (configured && !user) initialRoute = 'Auth';
  else if (settings.dob) {
    const [yy, mm, dd] = String(settings.dob).split('-').map((v) => parseInt(v, 10));
    const today = new Date();
    let age = today.getFullYear() - yy;
    const mDiff = (today.getMonth() + 1) - mm;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < dd)) age -= 1;
    if (age > 13) initialRoute = 'AgeBlocked';
    else if (!statsOnboardingSeen && !settings.hasSeenOnboarding) initialRoute = 'Onboarding';
  }
  else if (!statsOnboardingSeen && !settings.hasSeenOnboarding) initialRoute = 'Onboarding';

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: '#070b14' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        cardStyle: { backgroundColor: '#070b14' },
        cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
        animationEnabled: true, gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Category" component={CategoryScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Game" component={GameScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forScaleFromCenterAndroid, gestureEnabled: false }} />
      <Stack.Screen name="RoundComplete" component={RoundCompleteScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid }} />
      <Stack.Screen name="GameOver" component={GameOverScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Stats" component={StatsScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="DailyChallenge" component={DailyChallengeScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Levels" component={LevelsScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="AgeBlocked" component={AgeBlockedScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="TierLeaderboard" component={TierLeaderboardScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="TierUp" component={TierUpScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid, gestureEnabled: false }} />
      <Stack.Screen name="BattleQueue" component={BattleQueueScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Battle" component={BattleScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="BattleResult" component={BattleResultScreen} options={{ headerShown: false, gestureEnabled: false, cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid }} />
      <Stack.Screen name="LearningPath" component={LearningPathScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Lesson" component={LessonScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Paywall" component={PaywallScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid, presentation: 'modal' }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="ProMaxHub" component={ProMaxHubScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Tutor" component={TutorScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="ParentDashboard" component={ParentDashboardScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Avatar" component={AvatarScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
    </Stack.Navigator>
  );
}

function ThemedShell() {
  const { settings } = useSettings();
  const themeId = settings.theme || 'green';
  return (
    <ThemeProvider themeId={themeId}>
      <AuthProvider>
        <PlanProvider>
          <Navigator />
        </PlanProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, Poppins_900Black,
  });

  if (fontsLoaded) {
    // eslint-disable-next-line global-require
    const TextComp = require('react-native').Text;
    if (TextComp && !TextComp._poppinsApplied) {
      const oldRender = TextComp.render;
      TextComp.render = function (...args) {
        const origin = oldRender.call(this, ...args);
        return React.cloneElement(origin, {
          style: [{ fontFamily: 'Poppins_600SemiBold' }, origin.props.style],
        });
      };
      TextComp._poppinsApplied = true;
    }
  }

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <View style={{ flex: 1, backgroundColor: '#070b14' }}>
            <ThemedShell />
            {!splashDone ? <AnimatedSplash onDone={() => setSplashDone(true)} /> : null}
          </View>
        </NavigationContainer>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
