import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { AuthStackScreenProps } from '@/types/navigation';
import { useAuthWithApi } from '@/store';

type Props = AuthStackScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('demo@musicez.com');
  const [password, setPassword] = useState('password123');
  
  const { 
    login, 
    loginLoading, 
    loginError 
  } = useAuthWithApi();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please enter both email and password');
      return;
    }

    try {
      await login(email, password);
      // Navigation will happen automatically via store state change
    } catch (error) {
      // Error handling is done by the store
      console.error('Login failed:', error);
    }
  };

  const handleNavigateToRegister = () => {
    navigation.navigate('Register');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>🎵 MusicEZ</Text>
          <Text style={styles.subtitle}>AI-Powered Music Discovery</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.demoInfo}>
            <Text style={styles.demoTitle}>🚀 Demo Login</Text>
            <Text style={styles.demoText}>
              Pre-filled with demo credentials. Tap "Sign In" to test state management!
            </Text>
            <Text style={styles.demoCredentials}>
              Email: {email}{'\n'}Password: {password}
            </Text>
          </View>

          {loginError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                ❌ {loginError.message}
              </Text>
            </View>
          )}

          <TouchableOpacity 
            style={[styles.loginButton, loginLoading && styles.loginButtonDisabled]} 
            onPress={handleLogin}
            disabled={loginLoading}
          >
            {loginLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <Text style={styles.dividerText}>Don't have an account?</Text>
          </View>

          <TouchableOpacity 
            style={styles.registerButton} 
            onPress={handleNavigateToRegister}
          >
            <Text style={styles.registerButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ✅ State Management Active{'\n'}
            Using Zustand with AsyncStorage persistence
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 32,
  },
  placeholderInput: {
    height: 56,
    borderWidth: 2,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    color: '#8E8E93',
    fontSize: 14,
    fontStyle: 'italic',
  },
  loginButton: {
    backgroundColor: '#1DB954',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  divider: {
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  registerButton: {
    height: 56,
    borderWidth: 2,
    borderColor: '#1DB954',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#1DB954',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  demoInfo: {
    backgroundColor: '#e8f5e8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1DB954',
  },
  demoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 8,
    textAlign: 'center',
  },
  demoText: {
    fontSize: 14,
    color: '#155724',
    textAlign: 'center',
    marginBottom: 12,
  },
  demoCredentials: {
    fontSize: 12,
    color: '#155724',
    textAlign: 'center',
    fontFamily: 'monospace',
    backgroundColor: '#d4edda',
    padding: 8,
    borderRadius: 6,
  },
  errorContainer: {
    backgroundColor: '#ffe6e6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffcccb',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    textAlign: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
});