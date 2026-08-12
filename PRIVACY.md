# Privacy Policy — risu

**Last updated:** 11 August 2026

risu ("the app") is a personal-use food and nutrition logging application built for a
single individual. It is not distributed publicly, has no user accounts, and is not operated as a
commercial service.

This policy describes what the app does with data. It is written to be accurate about the app's
actual behaviour rather than to reserve broad rights.

## 1. There is no server

The app has no backend. There is no server operated by the developer that receives, stores, or
processes your data. All data is stored locally on your own device, and requests to third-party
services (listed in §3) are made directly from the device.

Because there is no server, the developer has no ability to access your logged data.

## 2. What is stored on your device

The following is stored locally, in an on-device database and file storage:

- Food and meal logs (what was eaten, when, quantities, calories, macronutrients)
- Body weight entries you record
- Your goal settings (calorie target, macro targets, deficit target)
- Foods and recipes you create, and a local cache of foods looked up from public food databases
- Meal photos you take or select, if you use photo-based logging
- Transcribed text from voice-based logging
- Calories-burned figures retrieved from WHOOP, if you connect a WHOOP account

This data remains on your device unless you explicitly configure the backup feature described in §4.

## 3. Third-party services

The app sends data to the following services only when you use the corresponding feature. Each is
subject to its own privacy policy.

| Service | What is sent | When |
|---|---|---|
| USDA FoodData Central | Your food search text | When you search for a food |
| Open Food Facts | Your food search text; scanned barcode numbers | When you search, or scan a barcode |
| Groq (Whisper) | The audio recording of your meal description | When you use voice logging |
| Google Gemini | The transcribed text of your meal description; photos of meals; photos of nutrition labels | When you use voice, photo, or barcode-fallback logging |
| WHOOP | OAuth authentication requests | Only if you connect a WHOOP account |

No advertising, analytics, crash-reporting, or user-tracking services are used. No data is sold,
shared, or transmitted to any party other than those listed above.

### Voice recordings

Audio is sent to Groq solely to produce a text transcript, and the local audio file is deleted
immediately afterwards. Only the resulting text is retained, stored on your device.

### Photos

Meal and nutrition-label photos are sent to Google Gemini solely to identify foods or read
nutritional values. Meal photos are also stored locally on your device and linked to the
corresponding log entry.

## 4. WHOOP data

If you choose to connect a WHOOP account, the app requests the following OAuth scopes:

- `read:cycles` — read your physiological cycle data
- `offline` — receive a refresh token so the connection does not expire after a short period

From your cycle data, the app reads **only** the energy-expenditure value (kilojoules), which it
converts to calories burned. This is used to calculate your daily net calories and deficit
progress. No other WHOOP data is read, and WHOOP data is never transmitted anywhere other than
between your device and WHOOP.

Calories-burned values are cached on your device so the figure remains visible when offline.

**Access tokens** are stored in your device's secure credential storage (iOS Keychain / Android
Keystore), not in the app's ordinary database.

**To revoke access:** use "Disconnect" in the app's Settings screen, which deletes the stored
tokens from your device. You may additionally revoke the app's access from your WHOOP account
settings at any time.

## 5. Backup (optional, off by default)

The app includes an optional manual backup feature. It is disabled unless you supply a storage
destination.

If you provide an Azure Blob Storage SAS URL in Settings, pressing "Back up now" uploads a copy of
the app's local database to **your own storage account**. The destination is a resource you own
and control; the developer has no access to it. Meal photos are not included in the backup.

The SAS URL you provide is stored in your device's secure credential storage. Backups occur only
when you manually trigger them.

## 6. Data retention and deletion

- **Local data:** retained until you delete individual entries within the app, or uninstall the
  app, which removes all local data.
- **WHOOP tokens:** deleted when you disconnect WHOOP in Settings, or when you uninstall the app.
- **Backups:** retained in your own storage account under your control, and deleted by you.

## 7. Children

The app is not directed at children and is not made available to the public.

## 8. Changes

If the app's data handling changes, this document will be updated along with the "Last updated"
date above.

## 9. Contact

**[stephenmg12345@gmail.com]**
