import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ClearWire Field',
  slug: 'clearwire-field',
  version: '0.0.1',
  orientation: 'portrait',
  // icon: './assets/icon.png',  // TODO: drop real PNG into apps/field-native/assets/
  scheme: 'clearwire',
  userInterfaceStyle: 'dark',
  // splash: {
  //   image: './assets/splash.png',
  //   resizeMode: 'contain',
  //   backgroundColor: '#0B0F14',
  // },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.clearwire.field',
    infoPlist: {
      NSCameraUsageDescription:
        'ClearWire needs camera access to photograph damaged infrastructure.',
      NSLocationWhenInUseUsageDescription:
        'ClearWire tags reports with your location so crews can find the damage.',
      NSPhotoLibraryUsageDescription:
        'ClearWire may save report photos to your library.',
    },
  },
  android: {
    package: 'com.clearwire.field',
    googleServicesFile: './google-services.json',
    // adaptiveIcon: {
    //   foregroundImage: './assets/adaptive-icon.png',
    //   backgroundColor: '#0B0F14',
    // },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  web: {
    bundler: 'metro',
    // favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow ClearWire to access your camera to photograph damage.',
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Allow ClearWire to use your location to tag damage reports.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '25892d13-14f5-4a75-9aa9-45cad71ac452',
    },
    // Runtime values come from EXPO_PUBLIC_ env vars
  },
};

export default config;
