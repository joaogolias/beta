package com.beta.streak

import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone

class StreakCalendarTest {
  private fun moment(year: Int, month: Int, day: Int, hour: Int, zone: String = "America/Sao_Paulo"): Calendar =
    GregorianCalendar(TimeZone.getTimeZone(zone)).apply {
      clear()
      set(year, month - 1, day, hour, 0, 0)
    }

  @Test fun `a used day never produces a reminder`() {
    val now = moment(2026, 10, 3, 20)
    assertFalse(StreakCalendar.shouldRemind(true, "2026-10-03", null, now))
    assertTrue(StreakCalendar.shouldRemind(true, "2026-10-02", null, now))
    assertFalse(StreakCalendar.shouldRemind(false, "2026-10-02", null, now))
  }

  @Test fun `reminders wait until evening and deliver at most once each local day`() {
    assertFalse(StreakCalendar.shouldRemind(true, "2026-10-02", null, moment(2026, 10, 3, 18)))
    assertTrue(StreakCalendar.shouldRemind(true, "2026-10-02", null, moment(2026, 10, 3, 19)))
    assertFalse(StreakCalendar.shouldRemind(true, "2026-10-02", "2026-10-03", moment(2026, 10, 3, 22)))
    assertTrue(StreakCalendar.shouldRemind(true, "2026-10-02", "2026-10-03", moment(2026, 10, 4, 19)))
  }

  @Test fun `widget preserves yesterday and expires after one missed calendar day`() {
    assertEquals(8, StreakCalendar.visibleCount(8, "2026-10-02", moment(2026, 10, 3, 23)))
    assertEquals(0, StreakCalendar.visibleCount(8, "2026-10-02", moment(2026, 10, 4, 0)))
    assertEquals(0, StreakCalendar.visibleCount(8, null, moment(2026, 10, 3, 20)))
  }

  @Test fun `mascot only gets angry in the evening before an active sequence expires`() {
    assertEquals(StreakMood.WELCOME, StreakCalendar.mascotMood(0, null, null, moment(2026, 10, 3, 20)))
    assertEquals(StreakMood.WELCOME, StreakCalendar.mascotMood(8, "2026-10-02", null, moment(2026, 10, 3, 18)))
    assertEquals(StreakMood.ANGRY, StreakCalendar.mascotMood(8, "2026-10-02", null, moment(2026, 10, 3, 19)))
    assertEquals(StreakMood.SAD, StreakCalendar.mascotMood(8, "2026-10-02", null, moment(2026, 10, 4, 0)))
    assertEquals(StreakMood.HAPPY, StreakCalendar.mascotMood(9, "2026-10-03", null, moment(2026, 10, 3, 20)))
  }

  @Test fun `returning day keeps the sad expression while the real count has already restarted`() {
    val now = moment(2026, 10, 4, 20)
    assertEquals(1, StreakCalendar.visibleCount(1, "2026-10-04", now))
    assertEquals(StreakMood.SAD, StreakCalendar.mascotMood(1, "2026-10-04", "2026-10-04", now))
    assertEquals(StreakMood.HAPPY, StreakCalendar.mascotMood(2, "2026-10-05", "2026-10-04", moment(2026, 10, 5, 20)))
    assertEquals(StreakMood.ANGRY, StreakCalendar.mascotMood(1, "2026-10-04", "2026-10-04", moment(2026, 10, 5, 20)))
    assertEquals(StreakMood.WELCOME, StreakCalendar.mascotMood(0, null, "2026-10-04", now))
  }

  @Test fun `the widget switches to evening expression even without reminder permission`() {
    assertEquals(moment(2026, 10, 3, 19).timeInMillis,
      StreakCalendar.nextRefresh(moment(2026, 10, 3, 9), false, "2026-10-02", hasActiveStreak = true))
    assertEquals(moment(2026, 10, 4, 0).timeInMillis,
      StreakCalendar.nextRefresh(moment(2026, 10, 3, 9), false, "2026-10-03", hasActiveStreak = true))
  }

  @Test fun `timezone travel backwards does not clear the sequence or send a reminder`() {
    val now = moment(2026, 10, 2, 22, "Pacific/Honolulu")
    assertEquals(8, StreakCalendar.visibleCount(8, "2026-10-03", now))
    assertFalse(StreakCalendar.shouldRemind(true, "2026-10-03", null, now))
    assertEquals(StreakMood.HAPPY, StreakCalendar.mascotMood(8, "2026-10-03", null, now))
  }

  @Test fun `refresh schedules local evening then midnight instead of fixed 24 hours`() {
    assertEquals(moment(2026, 10, 3, 19).timeInMillis,
      StreakCalendar.nextRefresh(moment(2026, 10, 3, 9), true, "2026-10-02"))
    assertEquals(moment(2026, 10, 4, 0).timeInMillis,
      StreakCalendar.nextRefresh(moment(2026, 10, 3, 9), true, "2026-10-03"))
    assertEquals(moment(2026, 10, 4, 0).timeInMillis,
      StreakCalendar.nextRefresh(moment(2026, 10, 3, 20), true, "2026-10-02"))
    val dstMorning = moment(2026, 3, 8, 0, "America/New_York")
    val nextMidnight = StreakCalendar.nextRefresh(dstMorning, false, "2026-03-08")
    assertEquals(23L * 60 * 60 * 1000, nextMidnight - dstMorning.timeInMillis)
  }

  @Test fun `invalid calendar dates are rejected`() {
    assertTrue(StreakCalendar.validDateKey("2028-02-29"))
    assertFalse(StreakCalendar.validDateKey("2026-02-29"))
    assertFalse(StreakCalendar.validDateKey("2026-10-3"))
    assertFalse(StreakCalendar.validDateKey("2026-13-03"))
  }
}
