package com.example.dukeride

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class RidePulseActivityRecognitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null || !ActivityRecognitionResult.hasResult(intent)) {
      return
    }

    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val activity = result.mostProbableActivity ?: return
    val payload = Bundle().apply {
      putString("type", activityTypeName(activity.type))
      putInt("confidence", activity.confidence)
      putString("detectedAt", isoNow())
    }

    RidePulseActivityRecognitionModule.emitActivity(Arguments.fromBundle(payload))

    val serviceIntent = Intent(context, RidePulseActivityRecognitionHeadlessService::class.java).apply {
      putExtras(payload)
    }
    try {
      context.startService(serviceIntent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (error: IllegalStateException) {
      Log.w("RidePulseMotion", "Unable to start motion headless task", error)
    }
  }

  private fun activityTypeName(type: Int): String {
    return when (type) {
      DetectedActivity.IN_VEHICLE -> "IN_VEHICLE"
      DetectedActivity.ON_BICYCLE -> "ON_BICYCLE"
      DetectedActivity.ON_FOOT -> "ON_FOOT"
      DetectedActivity.RUNNING -> "RUNNING"
      DetectedActivity.STILL -> "STILL"
      DetectedActivity.TILTING -> "TILTING"
      DetectedActivity.WALKING -> "WALKING"
      DetectedActivity.UNKNOWN -> "UNKNOWN"
      else -> "UNKNOWN"
    }
  }

  private fun isoNow(): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())
  }
}
