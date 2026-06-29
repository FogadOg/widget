# Chat Widget with API Integration

This is a Next.js chat widget that integrates with the Companin's AI agent API.

## Features

- Collapsible chat interface with configurable positioning

- Real-time messaging with AI agent

- OAuth authentication with widget tokens

- Transparent iframe embedding

- Dynamic sizing based on configuration

- Multi-language support

- Configurable appearance and behavior

## Widget Architecture

The widget consists of two main components:

### Widget Loader (`public/widget.js`)

A JavaScript loader that:

- Creates the iframe container

- Handles postMessage communication

- Manages dynamic sizing

- Provides programmatic API

### Widget App (`app/embed/session/`)

The React application that runs inside the iframe:

- Chat interface with message history

- Authentication handling

- Configuration management

- Responsive design

## API Integration

The widget connects to the Companin's Django API backend for chat functionality.

### Configuration

Create a `.env.local` file in the widget-app directory:

```env

NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

```

### Required Parameters

Provide your Widget ID on the script tag — the recommended form:

- `data-widget-key`: Your widget's Widget ID (the config's UUID, shown on the Install page). It resolves the client, agent, and config server-side, so it's the only identity value most installs need.

**Advanced (explicit IDs)** — for multi-instance setups you can pass these three instead of `data-widget-key`:

- `data-client-id`: Your OAuth client ID

- `data-agent-id`: The UUID of the agent to use for chat

- `data-config-id`: The UUID of the widget configuration

### Optional Parameters

- `data-locale`: Language code for widget localization (en, es, fr, etc.). Defaults to English.

- `data-dev`: Set to "true" for development mode (uses localhost URLs)

### Authentication Flow

1. Widget loader requests authentication token using client_id

2. Backend validates client_id and returns JWT token

3. Widget uses token for all API requests

4. Token automatically refreshes as needed

### Configuration Management

The widget fetches its configuration from the config endpoint using the config_id:

- Appearance settings (colors, fonts, dimensions)

- Behavior settings (start_open, position, mobile handling)

- Content settings (greeting messages, button configurations)

## Embedding Methods

### Recommended: Script Integration

```html

<script

  src="https://widget.companin.tech/widget.js"

  data-widget-key="YOUR_WIDGET_KEY"

  data-locale="en"

  data-dev="false">

</script>

```

### Alternative: Direct Iframe

```html

<iframe

  src="https://widget.companin.tech/embed/session?key=YOUR_WIDGET_KEY&locale=en"

  style="border: none; z-index: 999999; background-color: transparent; width: auto; height: auto;"

  title="AI Agent Widget">

</iframe>

```

## Widget Behavior

### Sizing

- **Collapsed**: Shows button sized according to config (sm: 48px, md: 56px, lg: 64px)

- **Expanded**: Uses dimensions from widget configuration

- Container automatically resizes via postMessage communication

### Positioning

- Button position controlled by config (bottom-right, bottom-left, etc.)

- When collapsed, button centers on screen if configured

- Smooth transitions between states

### State Management

- Initial state determined by config's `start_open` setting

- State persists during session

- Automatic collapse/expand on user interaction

/>

```

### Getting API Credentials

1. **Client ID**: Your OAuth application's `client_id` from Django admin

2. **Agent ID**: UUID of the agent from your dashboard

3. **Config ID**: UUID of the widget configuration from your dashboard

### API Endpoints Used

- `POST /api/v1/auth/widget-token` - Get authentication token

- `GET /organization/testing/widget-config/{config_id}` - Fetch widget configuration

- `POST /api/v1/sessions/` - Create a chat session

- `POST /api/v1/sessions/{session_id}/messages` - Send messages and receive AI responses

- `GET /api/v1/sessions/{session_id}/messages` - Load message history

## Development

First, run the development server:

```bash

npm run dev

```

Open [http://localhost:3001/embed/session](http://localhost:3001/embed/session) with your browser to see the widget.

## Configuration

The widget automatically:

- Parses data attributes for configuration

- Fetches widget config from the API

- Authenticates using OAuth tokens

- Sizes itself dynamically based on config

- Handles responsive behavior

## Internationalization

The widget supports multiple languages through the `data-locale` attribute:

- `en` - English (default)

- `es` - Spanish

- `fr` - French

- And more...

### Usage

Set the locale in your script tag:

```html

<script

  src="https://widget.companin.tech/widget.js"

  data-widget-key="YOUR_WIDGET_KEY"

  data-locale="es">

</script>

```

### Adding New Languages

Add translation files to the `locales/` directory and update the language detection logic.

1. Create a new JSON file in `/locales/` (e.g., `it.json`)

2. Add translations for all keys from `en.json`

3. Update the `LOCALES` object in `/lib/i18n.ts`

4. Update the `useWidgetTranslation` hook to include the new locale

## Message Interceptors

Interceptors let host pages inspect and transform messages before they are sent
to the AI agent or before they are displayed to the user. They are registered on
the `window.CompaninWidget` / `window.chat` API object (and
`window.CompaninDocsWidget` for the docs widget).

### `chat.beforeSend(fn)`

Runs **before** a user message is sent to the API. The interceptor receives the
raw message string and must return a (possibly modified) string or a `Promise`
that resolves to one. Return `null` to cancel the send entirely. Multiple
interceptors are chained in registration order; if any returns `null` the chain
stops.

```js
const chat = window.CompaninWidget;

// Append page context to every outgoing message
chat.beforeSend(message => `${message} [page: ${location.pathname}]`);

// Block messages that contain sensitive terms
chat.beforeSend(message => {
  if (message.toLowerCase().includes('password')) return null; // cancel
  return message;
});

// Async — enrich with data from your own API
chat.beforeSend(async message => {
  const ctx = await fetchUserContext();
  return `${message}\n\nUser plan: ${ctx.plan}`;
});
```

### `chat.afterReceive(fn)`

Runs **after** the agent's complete response is received, before it is rendered
in the chat UI. The interceptor receives the full response text and must return
a (possibly modified) string or a `Promise` that resolves to one. Multiple
interceptors are chained in registration order.

```js
// Replace template variables in agent responses
chat.afterReceive(message =>
  message.replace(/\{\{firstName\}\}/g, currentUser.firstName)
);

// Async — translate the response on the fly
chat.afterReceive(async message => {
  if (userLocale === 'es') return await translate(message, 'es');
  return message;
});
```

### Chaining

Both methods return the `WidgetAPI` instance so calls can be chained:

```js
chat
  .beforeSend(msg => msg.trim())
  .afterReceive(msg => msg.replace(/\bAI\b/g, 'Assistant'));
```

### Docs widget

The same API is available on `window.CompaninDocsWidget`:

```js
window.CompaninDocsWidget.beforeSend(msg => msg + ' [docs]');
window.CompaninDocsWidget.afterReceive(msg => sanitize(msg));
```

### How it works

Interceptors run in the **host page** (not inside the widget iframe). When the
iframe is about to send a message or has just received an agent response, it
posts a `WIDGET_INTERCEPT_REQUEST` postMessage to the parent. The loader runs
your registered functions and replies with `HOST_INTERCEPT_RESPONSE`. The iframe
waits up to 500 ms; if no reply arrives it falls back to the original content
so a slow or missing parent page never blocks the chat.

## Error Handling

The widget displays user-friendly error messages for:

- Missing API key or agent ID

- Network connectivity issues

- Invalid API credentials

- Session creation failures

