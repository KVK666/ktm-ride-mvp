import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

export function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode() {
    setMode(mode === "login" ? "register" : "login");
    setEmail("");
    setPassword("");
    setName("");
    setError("");
  }

  async function submit() {
    setError("");
    const cleanEmail = email.trim();
    const cleanName = name.trim();
    if (!cleanEmail || !password) {
      setError("Enter your email and password");
      return;
    }
    if (mode === "register" && !cleanName) {
      setError("Enter your name");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(cleanEmail, password);
      } else {
        await register(cleanEmail, password, cleanName);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.brandBlock}>
          <Text style={styles.kicker}>KTM Duke 250 Gen 3</Text>
          <Text style={styles.title}>Duke Ride</Text>
          <Text style={styles.subtitle}>Navigation, ride tracking, and speed analytics.</Text>
        </View>

        <View style={styles.form}>
          {mode === "register" ? (
            <TextInput
              autoComplete="off"
              importantForAutofill="no"
              textContentType="none"
              placeholder="Name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
          ) : null}
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label={mode === "login" ? "Login" : "Create account"}
            icon="log-in"
            loading={loading}
            onPress={submit}
          />
          <Text
            style={styles.switcher}
            onPress={switchMode}
          >
            {mode === "login" ? "Create a new rider account" : "Back to login"}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 22,
    justifyContent: "center"
  },
  brandBlock: {
    marginBottom: 28
  },
  kicker: {
    color: colors.orange,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 8
  },
  title: {
    color: colors.text,
    fontSize: 44,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 8
  },
  form: {
    gap: 12
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 54,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16
  },
  error: {
    color: colors.danger
  },
  switcher: {
    color: colors.orangeSoft,
    textAlign: "center",
    padding: 10,
    fontWeight: "700"
  }
});
