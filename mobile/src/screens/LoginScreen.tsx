import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../context/AuthContext";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

export function LoginScreen() {
  const { colors } = useTheme();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [name, setName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchMode() {
    setMode((current) => current === "login" ? "register" : "login");
    setRegisterStep(1);
    setPassword("");
    setName("");
    setBikeModel("");
    setError("");
    setMessage("");
    setForgotOpen(false);
  }

  function openForgotPassword() {
    setMode("login");
    setRegisterStep(1);
    setPassword("");
    setError("");
    setMessage("");
    setForgotOpen(true);
  }

  async function requestPasswordReset() {
    if (loading) return;
    setError("");
    setMessage("");
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Enter your email first");
      return;
    }
    setLoading(true);
    try {
      const response = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail })
      });
      setMessage(response.message || "If that email exists, we sent a password reset link.");
    } catch (err: any) {
      setError(err.message || "Unable to send reset link");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (loading) return;
    setError("");
    setMessage("");
    const cleanEmail = email.trim();
    if ((mode === "login" || registerStep === 1) && (!cleanEmail || !password)) {
      setError("Enter your email and password");
      return;
    }
    if (mode === "register" && registerStep === 1) {
      setRegisterStep(2);
      return;
    }
    const cleanName = name.trim();
    if (mode === "register" && !cleanName) {
      setError("Enter your name");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") await login(cleanEmail, password);
      else await register(cleanEmail, password, cleanName, bikeModel);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  const accountStep = mode === "login" || registerStep === 1;
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
          <View style={styles.brandBlock}>
            <Image source={require("../../assets/ridepulse-logo.png")} style={styles.logo} />
            <Text style={[styles.kicker, { color: colors.accent }]}>EVERY ROAD, REMEMBERED</Text>
            <Text style={[styles.title, { color: colors.text }]}>RidePulse</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>A private journal for the roads that stay with you.</Text>
          </View>
          <View style={[styles.form, { backgroundColor: colors.surface }]}>
            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: colors.text }]}>
                {forgotOpen ? "Reset password" : mode === "login" ? "Welcome back" : registerStep === 1 ? "Create your account" : "Make it yours"}
              </Text>
              <Text style={[styles.formCopy, { color: colors.muted }]}>
                {forgotOpen
                  ? "Enter your account email and we will send a secure reset link."
                  : mode === "login"
                    ? "Your journal is right where you left it."
                    : registerStep === 1
                      ? "Start with secure account details."
                      : "Tell RidePulse who is taking the journey."}
              </Text>
            </View>

            {forgotOpen ? (
              <Field label="Email">
                <TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.text }]} />
              </Field>
            ) : accountStep ? (
              <>
                <Field label="Email">
                  <TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.text }]} />
                </Field>
                <Field label="Password">
                  <View style={[styles.passwordShell, { backgroundColor: colors.surfaceHigh }]}>
                    <TextInput accessibilityLabel="Password" secureTextEntry={!passwordVisible} autoCapitalize="none" autoCorrect={false} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Enter password" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} style={[styles.passwordInput, { color: colors.text }]} />
                    <Pressable accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} onPress={() => setPasswordVisible((value) => !value)} style={styles.visibility}>
                      <Ionicons name={passwordVisible ? "eye-off" : "eye"} size={20} color={colors.muted} />
                    </Pressable>
                  </View>
                </Field>
              </>
            ) : (
              <>
                <Field label="Name">
                  <TextInput accessibilityLabel="Name" autoComplete="name" placeholder="Your name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.text }]} />
                </Field>
                <Field label="Motorcycle - Optional">
                  <TextInput accessibilityLabel="Motorcycle, optional" placeholder="e.g. CB350, MT-15, Classic 350" placeholderTextColor={colors.muted} value={bikeModel} onChangeText={setBikeModel} style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.text }]} />
                </Field>
              </>
            )}

            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            {message ? <Text style={[styles.success, { color: colors.accentSoft }]}>{message}</Text> : null}
            <PrimaryButton block label={forgotOpen ? "Send reset link" : mode === "login" ? "Open my journal" : registerStep === 1 ? "Continue" : "Create my journal"} icon={forgotOpen ? "mail" : mode === "login" || registerStep === 1 ? "arrow-forward" : "sparkles"} loading={loading} onPress={forgotOpen ? requestPasswordReset : submit} />
            {forgotOpen ? (
              <Pressable accessibilityRole="button" onPress={() => { setForgotOpen(false); setError(""); setMessage(""); }} style={styles.switchButton}>
                <Text style={[styles.switcher, { color: colors.accentSoft }]}>Back to sign in</Text>
              </Pressable>
            ) : null}
            {!forgotOpen && mode === "login" ? (
              <Pressable accessibilityRole="button" onPress={openForgotPassword} style={styles.switchButton}>
                <Text style={[styles.switcher, { color: colors.accentSoft }]}>Forgot password?</Text>
              </Pressable>
            ) : null}
            {!forgotOpen && mode === "register" && registerStep === 2 ? (
              <Pressable accessibilityRole="button" onPress={() => setRegisterStep(1)} style={styles.switchButton}>
                <Text style={[styles.switcher, { color: colors.accentSoft }]}>Back to account details</Text>
              </Pressable>
            ) : null}
            {!forgotOpen ? (
              <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switchButton}>
                <Text style={[styles.switcher, { color: colors.accentSoft }]}>{mode === "login" ? "New to RidePulse? Create a journal" : "Already have a journal? Sign in"}</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={styles.field}><Text style={[styles.label, { color: colors.textSoft }]}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, container: { flexGrow: 1, padding: 20, paddingVertical: 30, justifyContent: "center", gap: 28 }, brandBlock: { alignItems: "center" },
  logo: { width: 96, height: 96, borderRadius: 28, marginBottom: 18 }, kicker: { fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.5 }, title: { fontFamily: typography.extraBold, fontSize: 38, lineHeight: 44, marginTop: 4 }, subtitle: { fontFamily: typography.regular, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 6, maxWidth: 300 },
  form: { gap: 15, padding: 20, borderRadius: 28 }, formHeader: { gap: 4, marginBottom: 3 }, formTitle: { fontFamily: typography.extraBold, fontSize: 21 }, formCopy: { fontFamily: typography.regular, lineHeight: 20 }, field: { gap: 8 }, label: { fontFamily: typography.bold, fontSize: 12 },
  input: { borderRadius: 16, minHeight: 52, paddingHorizontal: 15, fontFamily: typography.medium, fontSize: 15 }, passwordShell: { minHeight: 52, borderRadius: 16, flexDirection: "row", alignItems: "center" }, passwordInput: { flex: 1, minHeight: 50, paddingLeft: 15, fontFamily: typography.medium, fontSize: 15 }, visibility: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  error: { fontFamily: typography.semibold, lineHeight: 20 }, success: { fontFamily: typography.semibold, lineHeight: 20 }, switchButton: { minHeight: 34, alignItems: "center", justifyContent: "center" }, switcher: { fontFamily: typography.bold, textAlign: "center", fontSize: 12 }
});
