import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform 
} from 'react-native';
import { AuthStackScreenProps } from '@/types/navigation';

type Props = AuthStackScreenProps<'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const handleRegister = () => {
    // TODO: Implement actual registration logic in future tasks
    console.log('Register pressed - will implement authentication in next tasks');
  };

  const handleBackToLogin = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join MusicEZ to discover amazing music</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.placeholderInput}>
            <Text style={styles.placeholderText}>Name input (coming soon)</Text>
          </View>

          <View style={styles.placeholderInput}>
            <Text style={styles.placeholderText}>Email input (coming soon)</Text>
          </View>

          <View style={styles.placeholderInput}>
            <Text style={styles.placeholderText}>Password input (coming soon)</Text>
          </View>

          <View style={styles.placeholderInput}>
            <Text style={styles.placeholderText}>Confirm Password input (coming soon)</Text>
          </View>

          <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
            <Text style={styles.registerButtonText}>Create Account</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <Text style={styles.dividerText}>Already have an account?</Text>
          </View>

          <TouchableOpacity 
            style={styles.loginButton} 
            onPress={handleBackToLogin}
          >
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            This is a placeholder registration screen.{'\n'}
            Form validation and authentication will be implemented in upcoming tasks.
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
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
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
  registerButton: {
    backgroundColor: '#1DB954',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  registerButtonText: {
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
  loginButton: {
    height: 56,
    borderWidth: 2,
    borderColor: '#1DB954',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
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
});