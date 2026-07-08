package com.example.dukeride

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class RidePulseActivityRecognitionHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: Bundle.EMPTY
    return HeadlessJsTaskConfig(
      "RidePulseActivityRecognitionTask",
      Arguments.fromBundle(extras),
      30_000,
      true
    )
  }
}
