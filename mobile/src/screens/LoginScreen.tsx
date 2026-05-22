import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { ThemeColors } from "../theme/colors";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";

export function LoginScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
          <Image source={require("../../assets/app-logo.png")} style={styles.logo} />
          <View style={styles.brandText}>
            <Text style={styles.kicker}>KTM Duke 250 Gen 3</Text>
            <Text style={styles.title}>Duke Ride</Text>
            <Text style={styles.subtitle}>Track. Navigate. Analyze.</Text>
          </View>
        </View>

        <View style={styles.form}>
          {mode === "register" ? (
            <TextInput
              autoComplete="name"
              textContentType="name"
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
            autoComplete="email"
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
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            textContentType={mode === "login" ? "password" : "newPassword"}
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

const createStyles = (colors: ThemeColors) => ({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center"
  },
  brandBlock: {
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  logo: {
    width: 86,
    height: 86,
    borderRadius: 8
  },
  brandText: {
    flex: 1,
    minWidth: 0
  },
  kicker: {
    color: colors.orange,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 6
  },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 8
  },
  form: {
    gap: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  input: {
    backgroundColor: colors.surfaceHigh,
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
