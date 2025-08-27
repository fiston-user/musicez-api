import { NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Search: undefined;
  Recommendations: undefined;
  Profile: undefined;
};

// Navigation prop types
export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;
export type AuthStackNavigationProp = NativeStackNavigationProp<AuthStackParamList>;
export type MainTabNavigationProp = BottomTabNavigationProp<MainTabParamList>;

// Screen props types
export type AuthStackScreenProps<T extends keyof AuthStackParamList> = {
  route: RouteProp<AuthStackParamList, T>;
  navigation: NativeStackNavigationProp<AuthStackParamList, T>;
};

export type MainTabScreenProps<T extends keyof MainTabParamList> = {
  route: RouteProp<MainTabParamList, T>;
  navigation: BottomTabNavigationProp<MainTabParamList, T>;
};

// Declare global types for React Navigation
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}