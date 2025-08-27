import 'dotenv/config';

export default {
  expo: {
    name: 'MusicEZ',
    slug: 'musicez-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    description: 'AI-powered music recommendation app that helps you discover new songs you\'ll love',
    primaryColor: '#1DB954',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.musicez.mobile',
      buildNumber: '1',
      infoPlist: {
        UIBackgroundModes: ['background-audio'],
        NSAppleMusicUsageDescription: 'This app uses Apple Music to provide better music recommendations.',
      },
    },
    android: {
      package: 'com.musicez.mobile',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
      edgeToEdgeEnabled: true,
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    extra: {
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
      appEnv: process.env.APP_ENV || 'development',
      debugMode: process.env.DEBUG_MODE === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
    },
    scheme: 'musicez',
    plugins: ['expo-secure-store'],
  },
};