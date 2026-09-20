# DawgPack Flutter Workshop Setup Guide

This guide covers everything from the DevDogs x GDGC Flutter workshop. Follow these steps if you were not able to attend in person.

## What is Flutter

Flutter is Google's open source, widget based UI toolkit for building apps for mobile, web, desktop, and embedded devices from a single codebase. It uses Dart as its programming language, which is syntactically similar to Java.

This project uses:
- Frontend: Flutter (Dart)
- Backend: Supabase

## Why Flutter

- **One codebase**: Every line of code you write can be translated to almost any platform you want an app on.
- **Easy to start**: Flutter is simple to pick up, but has a high skill ceiling for advanced work.

## Setup Instructions

Follow the steps below inside VS Code. The steps are the same on Windows and macOS except for keyboard shortcuts.

### Step 1: Install the Flutter extension

1. Open VS Code.
2. Click the **Extensions** tab in the sidebar.
3. Search for **Flutter** and install the official extension. This also installs the Dart extension automatically.

### Step 2: Start a new Flutter project

- **Windows**: Press `Control+Shift+P`, type `flutter`, and use the arrow keys to select **Flutter New Project**.
- **macOS**: Press `Command+Shift+P`, type `flutter`, and use the arrow keys to select **Flutter New Project**.

### Step 3: Download the Flutter SDK

When prompted to download an SDK, accept it.

- **Windows**: Choose your username folder in your C drive.
- **macOS**: Choose your home directory (your username folder).

### Step 4: Add the SDK to PATH

When prompted to **Add the SDK to PATH**, accept it. This lets you run `flutter` commands from any terminal.

### Step 5: Reload VS Code

- **Windows**: Press `Control+Shift+P`, type `developer reload window`, and press Enter.
- **macOS**: Press `Command+Shift+P`, type `developer reload window`, and press Enter.

### Step 6: Verify the install

Open a new terminal in VS Code and run:

```bash
flutter doctor
```

This checks your Flutter install and tells you if anything is missing, such as Android Studio or Xcode.

## Creating Your First Project

Once `flutter doctor` looks good, create a demo project.

1. Open a terminal in VS Code inside your Documents folder.
2. Run:
   ```bash
   flutter create workshop_demo
   ```
3. Move into the new project folder:
   ```bash
   cd workshop_demo
   ```
4. Run the doctor check again to confirm everything works inside the project:
   ```bash
   flutter doctor
   ```

## Key Widgets to Know

Widgets are the building blocks of every Flutter app. Here are a few essentials.

| Widget | Purpose |
|---|---|
| `Scaffold` | The base structure for every page you build |
| `Text` | Displays text on screen |
| `Button` (e.g. `ElevatedButton`) | Handles taps and user actions |
| `Row` | Arranges widgets horizontally |
| `Column` | Arranges widgets vertically |
| `Card` | Builds clean, elevated layers on screen |

Try building a simple screen using `Scaffold`, `Column`, `Text`, and `Card` to get comfortable with how widgets nest inside each other.

## Helpful Links

- [Flutter official docs](https://docs.flutter.dev/)
- [Install Flutter using VS Code](https://docs.flutter.dev/install/with-vs-code)
- [Flutter and VS Code guide](https://docs.flutter.dev/tools/vs-code)
- [Flutter widget catalog](https://docs.flutter.dev/ui/widgets)
- [Dart language tour](https://dart.dev/language)
- [Supabase docs](https://supabase.com/docs)
- [Android Studio download](https://developer.android.com/studio)

## Getting Help

If `flutter doctor` shows errors after following these steps, reach out to the DevDogs team on our group chat or bring your laptop to the next meeting so we can help you troubleshoot in person.
