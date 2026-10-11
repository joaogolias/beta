import { createContext, useContext, type PropsWithChildren } from 'react';
import { Modal, StyleSheet, Text, View, type ModalProps } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '../theme';

const EnvironmentContext = createContext<unknown>(undefined);

export function AppEnvironment({
  environment,
  children,
}: PropsWithChildren<{ environment: unknown }>) {
  return (
    <EnvironmentContext.Provider value={environment}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useDevelopmentEnvironment() {
  // Release APKs can target development. __DEV__ only describes the JS bundle.
  return useContext(EnvironmentContext) === 'development';
}

/** A reserved strip stays visible while content scrolls or the keyboard opens. */
export function EnvironmentFrame({ children }: PropsWithChildren) {
  const development = useDevelopmentEnvironment();
  if (!development) return children;
  return (
    <View style={styles.frame}>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        pointerEvents="none"
        style={styles.banner}
      >
        <Text
          accessibilityLabel="Ambiente de desenvolvimento"
          style={styles.label}
        >
          DEV
        </Text>
      </SafeAreaView>
      {/* The strip consumed the top inset; measure the remaining content area. */}
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </View>
  );
}

/** Native modals use another window, above the application's root strip. */
export function AppModal({ children, ...props }: ModalProps) {
  const development = useDevelopmentEnvironment();
  return (
    <Modal {...props}>
      {development ? (
        <SafeAreaProvider>
          <EnvironmentFrame>{children}</EnvironmentFrame>
        </SafeAreaProvider>
      ) : (
        children
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  banner: { backgroundColor: palette.tertiarySoft },
  label: {
    color: palette.tertiaryDeep,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 2,
    paddingVertical: 3,
  },
});
