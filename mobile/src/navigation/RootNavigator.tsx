import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface RootNavigatorProps {
  isAuthenticated: boolean;
}

export function RootNavigator({ isAuthenticated }: RootNavigatorProps) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        // User is authenticated, show main app flow
        <Stack.Screen 
          name="Main" 
          component={MainTabs}
          options={{
            animationTypeForReplace: 'push',
          }}
        />
      ) : (
        // User is not authenticated, show auth flow
        <Stack.Screen 
          name="Auth" 
          component={AuthStack}
          options={{
            animationTypeForReplace: 'pop',
          }}
        />
      )}
    </Stack.Navigator>
  );
}