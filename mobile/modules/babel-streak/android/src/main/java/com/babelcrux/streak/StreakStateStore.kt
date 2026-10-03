package com.babelcrux.streak

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import android.util.SizeF
import android.widget.RemoteViews
import java.util.Calendar

internal object StreakStateStore {
  private const val PREFERENCES = "babel_crux_daily_streak"
  private const val CHANNEL = "daily-streak"
  private const val NOTIFICATION_ID = 21001
  private const val ALARM_ID = 21002

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @Synchronized
  fun update(context: Context, state: NativeStreakState) {
    val prefs = preferences(context)
    val accountChanged = prefs.getString("ownerId", null) != state.ownerId
    val edit = prefs.edit()
    if (accountChanged) edit.clear()
    edit.putString("ownerId", state.ownerId)
      .putInt("currentStreak", state.currentStreak)
      .putString("lastActiveDate", state.lastActiveDate)
      .putString("restartedOnDate", state.restartedOnDate)
      .putBoolean("remindersEnabled", state.remindersEnabled)
      .apply()
    if (accountChanged || !state.remindersEnabled ||
      state.lastActiveDate == StreakCalendar.dateKey(Calendar.getInstance())
    ) notificationManager(context).cancel(NOTIFICATION_ID)
    refresh(context, allowReminder = false)
  }

  @Synchronized
  fun clear(context: Context) {
    preferences(context).edit().clear().apply()
    notificationManager(context).cancel(NOTIFICATION_ID)
    alarmManager(context).cancel(alarmIntent(context))
    updateWidgets(context, Calendar.getInstance())
  }

  @Synchronized
  fun refresh(context: Context, allowReminder: Boolean) {
    val now = Calendar.getInstance()
    val prefs = preferences(context)
    updateWidgets(context, now)
    if (prefs.getString("ownerId", null) == null) {
      alarmManager(context).cancel(alarmIntent(context))
      return
    }
    val enabled = prefs.getBoolean("remindersEnabled", false)
    val lastActive = prefs.getString("lastActiveDate", null)
    val count = prefs.getInt("currentStreak", 0)
    if (allowReminder && notificationsAllowed(context) && StreakCalendar.shouldRemind(
        enabled, lastActive, prefs.getString("lastNotifiedDate", null), now,
      )
    ) {
      showReminder(context, StreakCalendar.mascotMood(
        count, lastActive, prefs.getString("restartedOnDate", null), now,
      ))
      prefs.edit().putString("lastNotifiedDate", StreakCalendar.dateKey(now)).apply()
    }
    // Inexact alarms need no exact-alarm permission; Android may delay them for battery saving.
    alarmManager(context).setAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      StreakCalendar.nextRefresh(
        now, enabled, lastActive, StreakCalendar.visibleCount(count, lastActive, now) > 0,
      ),
      alarmIntent(context),
    )
  }

  fun notificationsAllowed(context: Context): Boolean {
    createNotificationChannel(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return false
    val manager = notificationManager(context)
    if (!manager.areNotificationsEnabled()) return false
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
  }

  private fun createNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL, "Lembrete da Betinha", NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "A Betinha lembra por volta das 19h, se você ainda não usou o beta hoje."
      }
      notificationManager(context).createNotificationChannel(channel)
    }
  }

  private fun mascotDrawable(mood: StreakMood): Int = when (mood) {
    StreakMood.HAPPY -> R.drawable.babel_streak_happy
    StreakMood.SAD -> R.drawable.babel_streak_sad
    StreakMood.ANGRY -> R.drawable.babel_streak_angry
    StreakMood.WELCOME -> R.drawable.babel_streak_ibex
  }

  private fun showReminder(context: Context, mood: StreakMood) {
    createNotificationChannel(context)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    val title = when (mood) {
      StreakMood.ANGRY -> "Ainda dá tempo de manter sua sequência"
      StreakMood.SAD -> "Um novo começo te espera"
      else -> "Seu próximo passo está esperando"
    }
    val message = when (mood) {
      StreakMood.ANGRY -> "Abra o beta hoje para continuar sua escalada. A Betinha está de olho!"
      StreakMood.SAD -> "A sequência anterior acabou. Abra o beta e recomece com a Betinha."
      else -> "A Betinha te espera. Abra o beta e dê mais um passo hoje."
    }
    builder.setSmallIcon(R.drawable.babel_streak_notification)
      .setLargeIcon(BitmapFactory.decodeResource(context.resources, R.drawable.babel_streak_portrait))
      .setContentTitle(title)
      .setContentText(message)
      .setStyle(Notification.BigTextStyle().bigText(message))
      .setCategory(Notification.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
    launchIntent(context)?.let { builder.setContentIntent(it) }
    try {
      notificationManager(context).notify(NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // Permission can be revoked between the permission check and delivery.
    }
  }

  private fun updateWidgets(context: Context, now: Calendar) {
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(ComponentName(context, StreakWidgetProvider::class.java))
    if (ids.isEmpty()) return
    val prefs = preferences(context)
    val signedIn = prefs.getString("ownerId", null) != null
    val lastActive = prefs.getString("lastActiveDate", null)
    val count = if (signedIn) StreakCalendar.visibleCount(prefs.getInt("currentStreak", 0), lastActive, now) else 0
    val activeToday = lastActive != null && lastActive >= StreakCalendar.dateKey(now)
    val restartedOnDate = prefs.getString("restartedOnDate", null)
    val mood = if (signedIn) StreakCalendar.mascotMood(count, lastActive, restartedOnDate, now) else StreakMood.WELCOME
    val status = when {
      !signedIn -> "Entre para começar"
      mood == StreakMood.SAD && activeToday -> "Hoje começa uma nova sequência"
      mood == StreakMood.SAD -> "Recomece com a Betinha"
      mood == StreakMood.ANGRY -> "Ainda dá tempo hoje!"
      activeToday -> "Passo de hoje concluído"
      count > 0 -> "Continue sua escalada"
      else -> "Um novo começo com a Betinha"
    }
    val days = if (count == 1) "dia seguido" else "dias seguidos"
    fun viewsFor(layout: Int) = RemoteViews(context.packageName, layout).apply {
      setImageViewResource(R.id.babel_streak_mascot, mascotDrawable(mood))
      setTextViewText(R.id.babel_streak_count, count.toString())
      setTextViewText(R.id.babel_streak_days, days)
      setTextViewText(R.id.babel_streak_status, status)
      setContentDescription(R.id.babel_streak_root, "Betinha. $count $days. $status. Abrir beta.")
      launchIntent(context)?.let { setOnClickPendingIntent(R.id.babel_streak_root, it) }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // The launcher chooses the best fit without waking the app during resizing.
      val views = RemoteViews(mapOf(
        SizeF(150f, 112f) to viewsFor(R.layout.babel_streak_widget),
        SizeF(150f, 180f) to viewsFor(R.layout.babel_streak_widget_tall),
        SizeF(260f, 112f) to viewsFor(R.layout.babel_streak_widget_wide),
      ))
      manager.updateAppWidget(ids, views)
    } else {
      // Older launchers report portrait/landscape bounds separately.
      for (id in ids) {
        val options = manager.getAppWidgetOptions(id)
        val portrait = viewsFor(widgetLayout(
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 150),
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 180),
        ))
        val landscape = viewsFor(widgetLayout(
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 150),
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 112),
        ))
        manager.updateAppWidget(id, RemoteViews(landscape, portrait))
      }
    }
  }

  private fun widgetLayout(width: Int, height: Int): Int = when {
    width >= 260 -> R.layout.babel_streak_widget_wide
    height >= 180 -> R.layout.babel_streak_widget_tall
    else -> R.layout.babel_streak_widget
  }

  private fun launchIntent(context: Context): PendingIntent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      PendingIntent.getActivity(context, 21003, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

  private fun alarmIntent(context: Context) = PendingIntent.getBroadcast(
    context, ALARM_ID,
    Intent(context, StreakRefreshReceiver::class.java).setAction("com.babelcrux.streak.REFRESH"),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun alarmManager(context: Context) = context.getSystemService(AlarmManager::class.java)
  private fun notificationManager(context: Context) = context.getSystemService(NotificationManager::class.java)
}
