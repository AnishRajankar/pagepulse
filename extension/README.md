# PagePulse Browser Extension

A lightweight Chrome/Edge/Brave extension that lets you add the current tab's URL to your PagePulse monitor with a single click.

## Installation (Unpacked / Developer Mode)

1. Open your browser and go to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this project.
5. The PagePulse icon will appear in your browser toolbar.

## Usage

1. Navigate to any public page you want to monitor.
2. Click the **PagePulse** icon in the toolbar.
3. Set your local PagePulse server URL (default: `http://localhost:3000`) and click **Save**.
4. Give the monitor a name and choose a check interval.
5. Click **Add to PagePulse**.
6. The monitor is created. Click **Open PagePulse dashboard** to see it.

## Notes

- The extension communicates with your **local PagePulse server**. The server must be running (`npm start`) for the extension to work.
- Only public HTTP/HTTPS URLs are accepted. Private or local addresses will be rejected by the server.
- No data is sent to any third-party service.
- For production use, update the server URL in the extension popup to your hosted instance's address.
