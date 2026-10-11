package com.beta.streak

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal enum class StreakMood { WELCOME, HAPPY, SAD, ANGRY }

/** The widget and reminder share the device's calendar, including DST and timezone changes. */
internal object StreakCalendar {
  const val REMINDER_HOUR = 19

  fun dateKey(now: Calendar): String = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
    timeZone = now.timeZone
  }.format(now.time)

  fun validDateKey(value: String): Boolean {
    if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(value)) return false
    return try {
      val parser = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply {
        isLenient = false
        timeZone = TimeZone.getTimeZone("UTC")
      }
      parser.parse(value) != null
    } catch (_: java.text.ParseException) {
      false
    }
  }

  fun visibleCount(count: Int, lastActiveDate: String?, now: Calendar): Int {
    if (lastActiveDate == null || !validDateKey(lastActiveDate)) return 0
    val yesterday = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
    // Keep the sequence when travelling west crosses the date line.
    return if (lastActiveDate >= dateKey(yesterday)) count.coerceAtLeast(0) else 0
  }

  fun mascotMood(count: Int, lastActiveDate: String?, restartedOnDate: String?, now: Calendar): StreakMood {
    if (lastActiveDate == null || !validDateKey(lastActiveDate)) return StreakMood.WELCOME
    val today = dateKey(now)
    if (lastActiveDate == today && restartedOnDate == today) return StreakMood.SAD
    if (lastActiveDate >= today) return StreakMood.HAPPY
    if (visibleCount(count, lastActiveDate, now) == 0) return StreakMood.SAD
    if (now.get(Calendar.HOUR_OF_DAY) >= REMINDER_HOUR) return StreakMood.ANGRY
    return StreakMood.WELCOME
  }

  fun shouldRemind(
    enabled: Boolean,
    lastActiveDate: String?,
    lastNotifiedDate: String?,
    now: Calendar,
  ): Boolean {
    val today = dateKey(now)
    return enabled && now.get(Calendar.HOUR_OF_DAY) >= REMINDER_HOUR &&
      (lastActiveDate == null || lastActiveDate < today) && lastNotifiedDate != today
  }

  fun nextRefresh(
    now: Calendar,
    reminderEnabled: Boolean,
    lastActiveDate: String?,
    hasActiveStreak: Boolean = false,
  ): Long {
    val midnight = (now.clone() as Calendar).apply {
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val reminder = (now.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, REMINDER_HOUR)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    // The widget also changes expression at 19h when notifications are disabled.
    return if ((reminderEnabled || hasActiveStreak) &&
      (lastActiveDate == null || lastActiveDate < dateKey(now)) &&
      reminder.timeInMillis > now.timeInMillis
    ) reminder.timeInMillis else midnight.timeInMillis
  }
}
