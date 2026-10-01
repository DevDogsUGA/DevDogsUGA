---
name: "Get Set Up"
description: "Meet Flutter, clone the workshop repo, and run the starter app on an emulator."
order: 0
---

<!-- Generated from Backstage apps/slides/decks/2026-09-21-flutter-intro.md by `pnpm export:md`; edit the deck, not this file. -->

# Get Set Up

<!-- prettier-ignore-start -->

## What You'll Build

- A two-tab app: a home screen, and a guestbook visitors can sign
- A bar along the bottom to switch between them

**Before you start**

Install Git, VS Code, the Flutter SDK and an Android emulator first: the [Prerequisites](/docs/workshops/getting-started/prerequisites#for-the-flutter-track) cover all of them.

This course is adapted by Sloan Finger from Nandan Praveen's Flutter workshop with GDGC at Framework Intros, Sep 21, 2026.

## What Is Flutter?

- Google's open-source, widget-based toolkit for building apps for mobile, web, desktop and embedded devices from one codebase
- Written in Dart, a language that reads a lot like Java
- DogPack, the club's study-group app, is built with it, on a Supabase backend

**Why Flutter?**

- **One codebase.** The same code runs on nearly any platform you'd want an app on.
- **Easy to start.** Flutter is quick to pick up, and has an equally high ceiling.

## Get the Workshop Code

```bash cwd=~
# Download the workshop repo
git clone https://github.com/DevDogsUGA/Mobile-Workshops
cd Mobile-Workshops
# Your own branch, starting from the course's first step
git switch -c <github-username>/01-flutter-intro 01-flutter-intro/00-start
# Install dependencies
flutter pub get
```

Open the `Mobile-Workshops` folder in VS Code (`code .` from that terminal works too). If `flutter pub get` says your Dart SDK is too old, run `flutter upgrade`. The workshop started from `flutter create workshop_demo`, which makes a fresh Flutter app. `01-flutter-intro/00-start` is that same starter, trimmed down, and every step below ends at a checkpoint like it, so you can catch up if you fall behind.

## Run It

Start your emulator first: in Android Studio, **More Actions → Virtual Device Manager**, then the play button beside your device. `flutter devices` should list it. Then:

```bash cwd=~/Mobile-Workshops
# Build the app and start it on the emulator
flutter run
```

The emulator shows "Hello, World!" in teal. Leave `flutter run` going while you work: after you save a file, press `r` in its terminal to **hot reload**, which swaps in your change in about a second, keeping the app where it was. `R` is a **hot restart**, which starts the app over.

<!-- prettier-ignore-end -->
