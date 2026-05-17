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
import AnimatedSplash from './src/components/AnimatedSplash';
import { SettingsProvider, useSettings } from './src/utils/settings';
import { ThemeProvider, THEMES } from './src/utils/theme';

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
  if (!ready) return null;
  const initialRoute = settings.hasSeenOnboarding ? 'Home' : 'Onboarding';

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
      <Stack.Screen name="Game" component={GameScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forScaleFromCenterAndroid }} />
      <Stack.Screen name="RoundComplete" component={RoundCompleteScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid }} />
      <Stack.Screen name="GameOver" component={GameOverScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Stats" component={StatsScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="DailyChallenge" component={DailyChallengeScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
      <Stack.Screen name="Levels" component={LevelsScreen} options={{ headerShown: false, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }} />
    </Stack.Navigator>
  );
}

function ThemedShell() {
  const { settings } = useSettings();
  const themeId = settings.theme || 'green';
  return (
    <ThemeProvider themeId={themeId}>
      <Navigator />
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
