import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [name, setName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode() {
    setMode((current) => current === "login" ? "register" : "login");
    setPassword("");
    setName("");
    setBikeModel("");
    setError("");
  }

  async function submit() {
    if (loading) return;
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
        await register(cleanEmail, password, cleanName, bikeModel);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
          <View style={styles.brandBlock}>
            <Image source={require("../../assets/ridepulse-logo.png")} style={styles.logo} />
            <Text style={styles.kicker}>Every road. Every motorcycle.</Text>
            <Text style={styles.title}>RidePulse</Text>
            <Text style={styles.subtitle}>Track rides, navigate confidently, and understand every journey.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>{mode === "login" ? "Welcome back" : "Create your rider profile"}</Text>
              <Text style={styles.formCopy}>{mode === "login" ? "Sign in to continue your ride history." : "Your motorcycle can be from any brand."}</Text>
            </View>
            {mode === "register" ? (
              <>
                <Field label="Name">
                  <TextInput autoComplete="name" textContentType="name" placeholder="Your name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
                </Field>
                <Field label="Motorcycle model" optional>
                  <TextInput placeholder="e.g. CB350, MT-15, Classic 350" placeholderTextColor={colors.muted} value={bikeModel} onChangeText={setBikeModel} style={styles.input} />
                </Field>
              </>
            ) : null}
            <Field label="Email">
              <TextInput autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={styles.input} />
            </Field>
            <Field label="Password">
              <View style={styles.passwordShell}>
                <TextInput secureTextEntry={!passwordVisible} autoCapitalize="none" autoCorrect={false} autoComplete={mode === "login" ? "current-password" : "new-password"} textContentType={mode === "login" ? "password" : "newPassword"} placeholder="Enter password" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} style={styles.passwordInput} />
                <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} onPress={() => setPasswordVisible((current) => !current)} style={styles.visibilityButton}>
                  <Ionicons name={passwordVisible ? "eye-off" : "eye"} size={21} color={colors.muted} />
                </Pressable>
              </View>
            </Field>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton label={mode === "login" ? "Sign in" : "Create account"} icon={mode === "login" ? "log-in" : "person-add"} loading={loading} onPress={submit} />
            <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switchButton}>
              <Text style={styles.switcher}>{mode === "login" ? "New to RidePulse? Create an account" : "Already have an account? Sign in"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.field}><Text style={styles.label}>{label}{optional ? "  ·  Optional" : ""}</Text>{children}</View>;
}

const createStyles = (colors: ThemeColors) => ({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 18, paddingVertical: 28, justifyContent: "center" as const, gap: 22 },
  brandBlock: { alignItems: "center" as const },
  logo: { width: 88, height: 88, borderRadius: 22, marginBottom: 14 },
  kicker: { color: colors.accent, fontWeight: "900", fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  title: { color: colors.text, fontSize: 32, lineHeight: 36, fontWeight: "900", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" as const, marginTop: 6, maxWidth: 320 },
  form: { gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  formHeader: { gap: 4, marginBottom: 2 },
  formTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  formCopy: { color: colors.muted, lineHeight: 20 },
  field: { gap: 8 },
  label: { color: colors.textSoft, fontSize: 13, fontWeight: "800" },
  input: { backgroundColor: colors.surfaceHigh, borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 46, color: colors.text, paddingHorizontal: 13, fontSize: 15 },
  passwordShell: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHigh, flexDirection: "row" as const, alignItems: "center" as const },
  passwordInput: { flex: 1, minHeight: 44, color: colors.text, paddingLeft: 13, fontSize: 15 },
  visibilityButton: { width: 44, minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 20 },
  switchButton: { minHeight: 38, alignItems: "center" as const, justifyContent: "center" as const },
  switcher: { color: colors.accentSoft, textAlign: "center" as const, fontWeight: "800" }
});
