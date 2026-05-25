import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  AutoTrackingStatus,
  disableAutoTracking,
  enableAutoTracking,
  getAutoTrackingStatus,
  syncPendingRidesForCurrentUser
} from "../services/autoRideTracking";

const initialStatus: AutoTrackingStatus = {
  enabled: false,
  label: "Off",
  pendingCount: 0,
  autoRideActive: false
};

export function useAutoTracking() {
  const [status, setStatus] = useState<AutoTrackingStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError("");
      await syncPendingRidesForCurrentUser();
      setStatus(await getAutoTrackingStatus());
    } catch (err: any) {
      setError(err.message || "Auto tracking status unavailable");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const interval = setInterval(refresh, 10000);
      return () => clearInterval(interval);
    }, [refresh])
  );

  const toggle = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setError("");
      try {
        const nextStatus = enabled ? await enableAutoTracking() : await disableAutoTracking();
        setStatus(nextStatus);
      } catch (err: any) {
        setError(err.message || "Unable to update automatic tracking");
        setStatus(await getAutoTrackingStatus());
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const retryPendingUploads = useCallback(async () => {
    setLoading(true);
    setError("");
    setSyncMessage("Retrying pending ride upload...");
    try {
      const result = await syncPendingRidesForCurrentUser();
      setStatus(await getAutoTrackingStatus());
      if (result.remaining) {
        setError(`Upload still pending: ${result.lastError || "Check internet and try again."}`);
        setSyncMessage("");
        return;
      }
      if (result.uploaded) {
        setSyncMessage(`${result.uploaded} ride${result.uploaded === 1 ? "" : "s"} uploaded successfully.`);
        return;
      }
      setSyncMessage("No pending ride uploads.");
    } catch (err: any) {
      setError(err.message || "Pending ride upload failed");
      setStatus(await getAutoTrackingStatus());
      setSyncMessage("");
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, error, syncMessage, refresh, retryPendingUploads, toggle };
}
