import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { getProfilePhotoUri } from "../services/profilePhoto";
import { typography } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { User } from "../types";

function initialsFor(name?: string | null) {
  const parts = (name || "Rider").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "R";
}

export function ProfileAvatar({
  user,
  size = 54,
  radius = 19,
  style
}: {
  user?: User | null;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const displayName = user?.name?.trim() || "Rider";

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getProfilePhotoUri(user?.id).then((nextUri) => {
        if (active) setUri(nextUri);
      });
      return () => {
        active = false;
      };
    }, [user?.id, user?.profilePhotoUpdatedAt])
  );

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.accent },
        style
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} />
      ) : (
        <Text style={[styles.initials, { color: colors.onAccent, fontSize: Math.max(16, size * 0.36) }]}>
          {initialsFor(displayName)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  image: {
    width: "100%",
    height: "100%"
  },
  initials: {
    fontFamily: typography.extraBold
  }
});
