package com.app.moudienetplay

import android.os.Build
import android.os.Bundle
import android.util.Log

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

/**
 * Deliberately stays close to Expo's generated activity. Startup UI must be
 * rendered by the regular React root; no native overlay or pre-draw gate is
 * allowed to sit above it.
 */
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    try {
      super.onCreate(null)
    } catch (error: Throwable) {
      Log.e("MoudieStartup", "ReactActivity could not be created", error)
      throw error
    }
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
    )
  }

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) super.invokeDefaultOnBackPressed()
      return
    }
    super.invokeDefaultOnBackPressed()
  }
}
