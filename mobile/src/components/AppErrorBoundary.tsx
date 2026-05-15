import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./PrimaryButton";
import { diagnosticDetails, logDiagnostic } from "../services/diagnostics";
import { colors } from "../theme/colors";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logDiagnostic({
      level: "error",
      area: "app",
      message: "Unhandled app render error",
      details: diagnosticDetails(error)
    });
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Duke Ride hit a screen error</Text>
        <Text style={styles.copy}>
          The error was saved in local diagnostics. Close and reopen the app if this keeps happening.
        </Text>
        <PrimaryButton label="Try again" icon="refresh" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    gap: 14,
    backgroundColor: colors.background
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    lineHeight: 20
  }
});
