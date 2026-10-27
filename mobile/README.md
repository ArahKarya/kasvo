# Kasvo mobile (Capacitor)

The Android and iOS app is a thin shell around **your own Kasvo server**: on first launch it asks for
the server address, checks `/api/health`, and then opens Kasvo itself. Every feature of the web app is
available, with the phone layout (bottom tabs, quick "Record"). It needs a connection to the server;
there is no offline mode.

## Run against your laptop

1. Start Kasvo so the phone can reach it on your Wi-Fi:

   ```bash
   # in the repo root; replace with your laptop's Wi-Fi IP
   KASVO_DEV_ORIGINS=192.168.1.10 pnpm dev:lan
   ```

2. Build and run the app (`pnpm --dir mobile …`):

   | Platform | Needs | Command |
   |---|---|---|
   | Android | JDK 21, Android SDK (+ an emulator or a phone with USB debugging) | `pnpm --dir mobile android`, or `pnpm --dir mobile apk` for `android/app/build/outputs/apk/debug/app-debug.apk` |
   | iOS | Xcode (full app, not only Command Line Tools) | `pnpm --dir mobile ios` |

3. In the app, enter `192.168.1.10:3100`. On the Android emulator the laptop is `10.0.2.2:3100`.
   "Change server" is in Kasvo's **More** page.

## Notes

- Plain `http` is allowed because self-hosted servers on a home network rarely have certificates.
  A production server reached over `http` also needs `COOKIE_SECURE=false`; prefer `https`.
- iOS asks for local-network permission the first time it connects to a LAN address.
- `www/` holds only the setup screen (no build step). After changing it or `capacitor.config.json`,
  run `pnpm --dir mobile sync`.
- App Store review may reject apps that only wrap a website; this shell is meant for self-hosting
  and sideloading.
