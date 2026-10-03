package com.babelcrux.streak

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NativeStreakState : Record {
  @Field var ownerId: String = ""
  @Field var currentStreak: Int = 0
  @Field var lastActiveDate: String? = null
  @Field var restartedOnDate: String? = null
  @Field var remindersEnabled: Boolean = false
}

class BabelStreakModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BabelStreak")

    AsyncFunction("syncStreak") { state: NativeStreakState ->
      require(state.ownerId.isNotBlank()) { "A streak must belong to an account." }
      require(state.currentStreak >= 0) { "A streak cannot be negative." }
      require(state.lastActiveDate == null || StreakCalendar.validDateKey(state.lastActiveDate!!)) {
        "A streak date must use YYYY-MM-DD."
      }
      require(state.restartedOnDate == null || StreakCalendar.validDateKey(state.restartedOnDate!!)) {
        "A streak restart date must use YYYY-MM-DD."
      }
      StreakStateStore.update(requireNotNull(appContext.reactContext), state)
    }

    AsyncFunction("clearStreak") {
      StreakStateStore.clear(requireNotNull(appContext.reactContext))
    }

    AsyncFunction("notificationsAllowed") {
      StreakStateStore.notificationsAllowed(requireNotNull(appContext.reactContext))
    }

    AsyncFunction("requestWidgetPin") {
      val context = requireNotNull(appContext.reactContext)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) false else {
        val manager = AppWidgetManager.getInstance(context)
        manager.isRequestPinAppWidgetSupported && manager.requestPinAppWidget(
          ComponentName(context, StreakWidgetProvider::class.java), null, null,
        )
      }
    }
  }
}
