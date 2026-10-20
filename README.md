# Week Planner

A 24-hour clock wheel for planning your day around work, lunch, commute, sleep and the things you actually want to do. It also keeps a time bank for travel to an alternative office and shows how much free time you have left.

It is a single static web page (plain HTML, CSS and JavaScript). There is no build step and no server.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure, settings, week navigation, export options |
| `app.js` | All logic: calculations, the wheel, views, dragging, export |
| `style.css` | Styling |
| `IDEAS.md` | Backlog of future ideas |

## Running it

- Locally: open `index.html` in a desktop browser.
- On a phone: host the folder somewhere static (GitHub Pages or Netlify) and open the address. Opening it as a file on a phone often does not keep your data.

## Views (tabs)

- **Calendar** (Monday to Friday): a day picker for the week, then the 24-hour wheel as the main focus. Below it are the Office / WFH switch, key times for the day (start, finish, work, lunch, commute), then cards for work hours, sleep, tasks and time editing. The week check follows. Arrows or swiping move between weekdays.
- **Free time / projects**: the wheel with a green ring showing free gaps, a list of gaps with suggestions, a finder that lists gaps long enough for a task and can book one, and the rest of the week (including weekends) as task lists to plan ahead. Tap a day heading to open it on the wheel.

## The wheel

- Midnight is at the top. It is a true 24 hours, with notches every hour.
- Colours: purple commute, blue work, orange lunch, pale lilac sleep, red tasks, green free time.
- A "now" hand shows the current time (today only), plus a marker one hour ahead.
- **Drag** work, lunch, sleep or a task to move it. Drag the white work dots to resize the workday; tap a task to show its resize dots. Changes snap to 15 minutes, or 1 minute with "Exact minutes" on.
- **Sleep** has two white dots to set bedtime and wake time separately.
- **Tap a task** to select it. Drag its end dots, or use the −15 / +15 / +1 h buttons, to change how long it runs.

## Features

- **Office / WFH** per day. Office adds a faded commute buffer before and after work (your normal commute, or the logged travel time); WFH shows only the work block and no commute. Commute buffers count as busy time, in the sleep check and in the calendar export.
- Plan each day by start time or finish time, with lunch length, lunch start and an option to eat into lunch.
- Weekends are off by default.
- **Time bank**: travel to an alternative office beyond your normal commute is banked. You can spend banked time to shorten a day. The balance carries across weeks.
- **Weekly check**: planned hours against target, and the bank brought forward, changed and carried forward.
- **Sleep check**: sleep length (flags under 7 hours), time between finishing work and bed, and from waking to leaving.
- **Tasks** with an optional time and length. They are shown on the wheel and treated as busy time when working out free time.
- **Calendar export (.ics)**: tick any of Work, Commute, Lunch, Tasks, Sleep and export the viewed week.
- **Sharing (no accounts)**: each timed task has a **Share** button that sends a calendar invite (.ics) through the phone's share sheet. On the Free time tab, **Share my free time this week** sends a text listing gaps of an hour or more. On desktop the invite downloads and the text is copied. Nothing syncs after sharing, so changes need to be sent again.

## Settings

Hours per day, lunch length, usual start, finish and lunch time, bedtime, wake time, normal commute, and Exact minutes (1-minute steps instead of 15).

## Data and privacy

Everything is stored in your browser's local storage under the key `worktime`. Nothing is sent anywhere.

- It is per browser and per device. Phone and laptop do not sync.
- Clearing site data, private browsing, or (on iPhone Safari) not visiting for about a week can remove it.
- There is no backup or import yet. See the roadmap.

### Data shape

```
worktime = {
  settings: { hours, lunch, start, finish, lunchAt, commute, sleepAt, wakeAt },
  weeks: { "YYYY-MM-DD" (Monday): [ day x 7 ] },
  view, exact, export: { work, commute, lunch, tasks, sleep }
}
day = { off, mode, time, lunchAt, cut, tFrom, tTo, use,
        tasks: [ { text, time, dur, done } ] }
```

## Roadmap: from web page to iPhone app

The aim is for the wheel to be the main focus, and for the app to become a general calendar for finding time for the things people care about.

### Phase 0: make the web version solid
- Export / import a JSON backup.
- Tidy `app.js` into modules (state, calculations, wheel, views, export) before porting.
- Add automated tests for the calculations (time bank, free slots, sleep, overnight wrap-around).
- Fix known gaps: overnight work, tasks that cross midnight, daylight-saving days.

### Phase 1: installable PWA
- Web app manifest and service worker so it works offline and can be added to the home screen.
- Safe-area and large-touch-target polish for iPhone.
- Hosting on a stable address.

### Phase 2: native iPhone app
Decide the approach first:

| Option | Pros | Cons |
|--------|------|------|
| Wrap the web app (Capacitor) | Fastest, reuses all code | Less native feel |
| SwiftUI rewrite | Best feel, widgets and Live Activities | Everything rebuilt |
| React Native / Expo | One codebase, native UI | New stack to learn |

Recommended path: wrap with Capacitor to reach the App Store quickly, then move the wheel to SwiftUI if it proves worthwhile.

Native features to plan for:
- **Calendar**: read and write events with EventKit, replacing the .ics export, so free time reflects real commitments.
- **Notifications**: reminders for lunch, finish time and bedtime.
- **Widgets and Lock Screen**: the day wheel and "finish in 2h 10m" countdown.
- **Live Activity / Dynamic Island**: countdown to finish or lunch.
- **Shortcuts and Siri**: "How much free time do I have today?"
- **iCloud sync**: one data set across devices (CloudKit).
- **Apple Health**: optional sleep data to compare with planned sleep.
- **Local storage**: move to a proper store (SwiftData or SQLite) with migration from the web data shape above.

### Phase 3: the free-time calendar
- Recurring protected time (gym, family) that always blocks the wheel.
- Tags and weekly targets, for example three hours of project time.
- Smart suggestions that match tasks to free gaps by length.
- Real sharing: shared task lists and seeing when others are free. This needs accounts and a backend, or iCloud sharing (CloudKit) in the native app. The simple version (share a task invite or your free gaps) already exists and needs neither.
- Month and week overview, not only single days.

### Before submitting to the App Store
- Apple Developer account and app identifiers.
- App icon, screenshots and listing text.
- Privacy policy and the App Privacy answers. Local-only data keeps this simple.
- Accessibility: VoiceOver labels for the wheel and an accessible, non-drag way to change every time.
- TestFlight beta with a few users.

## Open questions

- How far should sharing go: invites and free-gap texts only, or shared lists with accounts?
- Free app, one-off purchase, or subscription?
- Should work hours and the time bank stay central, or become one calendar source among many?
