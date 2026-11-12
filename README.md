# Ambient Clock

Ambient Clock is a PixelMug application that displays a clock in three styles and lets the user configure the timezone, clock sounds, ambient noise, volume, and sleep timer from a WebApp.

The project contains:

- a Bot that declares and binds a PixelMug S1 device and opens the WebApp;
- a Vue WebApp that starts the device application and communicates over BLE;
- an on-device MicroPython application using `BleAppService`, MicroPyxel, and the audio service.

## Requirements

- PixelMug Studio;
- a Bubble account and Bot token;
- a PixelMug S1 Pro or S1 Lite device;
- a computer and phone on the same local network;
- Node.js 20.6 or later.

## Run in PixelMug Studio

1. Open this project directory in PixelMug Studio.
2. In **My Bubble**, set the token for the Bot used by this project.
3. Select that Bot in the project settings.
4. Select a WebApp address reachable from the phone running the Bubble App.
5. Enable **Run device code automatically on start**.
6. Start the agent and bind a PixelMug to the Bot slot.
7. Open the Ambient Clock page from the Bot chat and choose **Open on PixelMug**.

Studio supplies `BOT_TOKEN`, `BOT_API_BASE_URL`, `STUDIO_WEBAPP_URL`, `STUDIO_MPS_ID`, and `STUDIO_MPS_VERSION` at runtime. Tokens and local configuration files are not stored in the project.

## Run checks locally

Install the root Bot dependency and the WebApp dependencies, then build the WebApp:

```powershell
npm install
npm --prefix webapp install
npm --prefix webapp run build
```

The device entry point is `mpy/__main__.py`; the deployment manifest is `mpy/mps.json`.

## Device and audio notes

The built-in tick and ambient sounds are stored under `mpy/assets/`. Custom sounds configured in the WebApp use remote HTTP or HTTPS URLs and must be reachable by the device. MPY application data may be removed during redeployment, so important settings should not rely on device-local persistence.
