package com.example.dukeride

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.ActivityRecognition
import expo.modules.location.AppForegroundedSingleton
import java.lang.ref.WeakReference

class RidePulseActivityRecognitionModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  init {
    reactContextRef = WeakReference(reactContext)
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun startActivityRecognition(intervalMs: Double, promise: Promise) {
    if (!isGooglePlayServicesAvailable(reactContext)) {
      promise.reject("ACTIVITY_RECOGNITION_UNAVAILABLE", "Google Play Services activity recognition is unavailable on this device.")
      return
    }
    if (!hasActivityRecognitionPermission(reactContext)) {
      promise.reject("ACTIVITY_RECOGNITION_PERMISSION", "Physical activity permission is required for motion-first auto tracking.")
      return
    }

    val updateInterval = intervalMs.toLong().coerceAtLeast(10_000L)
    ActivityRecognition.getClient(reactContext)
      .requestActivityUpdates(updateInterval, pendingIntent(reactContext))
      .addOnSuccessListener {
        prefs(reactContext).edit().putBoolean(KEY_RUNNING, true).apply()
        promise.resolve(null)
      }
      .addOnFailureListener { error ->
        promise.reject("ACTIVITY_RECOGNITION_START_FAILED", error.message, error)
      }
  }

  @ReactMethod
  fun stopActivityRecognition(promise: Promise) {
    ActivityRecognition.getClient(reactContext)
      .removeActivityUpdates(pendingIntent(reactContext))
      .addOnCompleteListener {
        prefs(reactContext).edit().putBoolean(KEY_RUNNING, false).apply()
        promise.resolve(null)
      }
  }

  @ReactMethod
  fun getActivityRecognitionStatus(promise: Promise) {
    val status = Arguments.createMap().apply {
      putBoolean("available", isGooglePlayServicesAvailable(reactContext))
      putBoolean("running", prefs(reactContext).getBoolean(KEY_RUNNING, false))
      putBoolean("permissionGranted", hasActivityRecognitionPermission(reactContext))
    }
    promise.resolve(status)
  }

  @ReactMethod
  fun finishBackgroundActivityHandling(promise: Promise) {
    AppForegroundedSingleton.isForegrounded = false
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by NativeEventEmitter.
  }

  companion object {
    const val MODULE_NAME = "RidePulseActivityRecognition"
    const val EVENT_NAME = "RidePulseActivityChanged"
    const val ACTION_ACTIVITY_RECOGNITION = "com.example.dukeride.ACTIVITY_RECOGNITION"
    private const val PREFS_NAME = "ridepulse_activity_recognition"
    private const val KEY_RUNNING = "running"
    private var reactContextRef: WeakReference<ReactApplicationContext>? = null

    fun pendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, RidePulseActivityRecognitionReceiver::class.java).apply {
        action = ACTION_ACTIVITY_RECOGNITION
      }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      return PendingIntent.getBroadcast(context, 4207, intent, flags)
    }

    fun emitActivity(event: WritableMap): Boolean {
      val context = reactContextRef?.get()
      if (context?.hasActiveReactInstance() == true && context.lifecycleState == LifecycleState.RESUMED) {
        context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_NAME, event)
        return true
      }
      return false
    }

    fun hasActivityRecognitionPermission(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        return true
      }
      return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACTIVITY_RECOGNITION
      ) == PackageManager.PERMISSION_GRANTED
    }

    private fun isGooglePlayServicesAvailable(context: Context): Boolean {
      return GoogleApiAvailability.getInstance()
        .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    private fun prefs(context: Context) =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }
}
