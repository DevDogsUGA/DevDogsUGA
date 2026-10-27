<script setup lang="ts">
// One meeting, one row: date block, an eyebrow that changes with rank
// ("Next meeting", "Then", "After that"), the meeting's name, and its
// time/location line.
//
// Ported from the platform homepage's
// `apps/platform/src/components/EventsSection/NextMeetingStrip.tsx`, which
// this deck can't import directly (it's a server component reading a live
// Postgres connection, and the slides app has no server) -- restyled for
// the deck's dark card/hairline system instead of the site's white-plate,
// black-border, block-shadow look, but keeping the same shape: eyebrow
// over name over time/location, in a date-led row.
import { computed } from 'vue'
import { EVENT_CATEGORY_VISUALS } from '@devdogsuga/sdk/brand/event'
import type { DeckMeeting } from '../vite/meetings'

const props = withDefaults(defineProps<{
  meeting: DeckMeeting
  eyebrow?: string
}>(), {
  eyebrow: 'Next meeting',
})

// Mirrored from `@devdogsuga/og/event`'s `EVENT_TZ` (see the platform's
// `lib/eventTime.ts`) -- the slides app doesn't depend on `@devdogsuga/og`,
// so this is a second copy of the one constant, not a second source of
// truth for how meeting times are read. Every meeting in the club's data
// happens here, so every time on this slide reads in this zone regardless
// of where the deck is being viewed from.
const EVENT_TZ = 'America/New_York'

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TZ, weekday: 'short' })
const DAY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TZ, day: 'numeric' })
const DATE_FMT = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TZ, weekday: 'long', month: 'long', day: 'numeric' })
const TIME_FMT = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TZ, hour: 'numeric', minute: '2-digit' })

const startsAt = computed(() => new Date(props.meeting.startsAt))
const endsAt = computed(() => new Date(props.meeting.endsAt))

const weekday = computed(() => WEEKDAY_FMT.format(startsAt.value))
const day = computed(() => DAY_FMT.format(startsAt.value))

// The resolved title from the events config (series applied), else the date.
const title = computed(() => props.meeting.title ?? DATE_FMT.format(startsAt.value))

const timeSpan = computed(() => `${TIME_FMT.format(startsAt.value)} – ${TIME_FMT.format(endsAt.value)}`)

const location = computed(() => [props.meeting.building, props.meeting.location].filter(Boolean).join(' '))

// The event's own colour, as on the website's calendar: by its resolved
// category. Not the slide's accent, so the cards don't blend into the heading
// and chip.
const accent = computed(() => {
  const category = props.meeting.category as keyof typeof EVENT_CATEGORY_VISUALS
  return category in EVENT_CATEGORY_VISUALS ? EVENT_CATEGORY_VISUALS[category].accent : undefined
})
</script>

<template>
  <div class="dd-meeting-strip" :style="accent ? { '--accent': accent } : undefined">
    <div class="dd-meeting-date">
      <span class="dd-meeting-weekday">{{ weekday }}</span>
      <span class="dd-meeting-day">{{ day }}</span>
    </div>
    <div class="dd-meeting-body">
      <p class="dd-meeting-eyebrow">
        {{ eyebrow }}
      </p>
      <p class="dd-meeting-title">
        {{ title }}
      </p>
      <p class="dd-meeting-meta">
        {{ timeSpan }}
        <template v-if="location">
          <span class="dd-meeting-meta-sep">&middot;</span>{{ location }}
        </template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.dd-meeting-strip {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  width: 100%;
  padding: 0.85rem 1.25rem;
  border-radius: 0.75rem;
  background: var(--dd-card-fill);
  border: 1px solid var(--dd-hairline);
}

.dd-meeting-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 3.25rem;
  flex-shrink: 0;
  line-height: 1;
}

.dd-meeting-weekday {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.dd-meeting-day {
  margin-top: 0.3rem;
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  font-size: 1.8rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.dd-meeting-body {
  min-width: 0;
  flex: 1;
}

.dd-meeting-eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.dd-meeting-title {
  margin: 0.15rem 0 0;
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  font-size: 1.2rem;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dd-meeting-meta {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--dd-grey-support);
}

.dd-meeting-meta-sep {
  margin: 0 0.4em;
}
</style>
