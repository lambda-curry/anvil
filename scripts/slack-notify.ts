/**
 * Post a message to the #scout-updates Slack channel.
 * Usage: SLACK_BOT_TOKEN=... bun run scripts/slack-notify.ts "message text"
 * Usage: SLACK_BOT_TOKEN=... bun run scripts/slack-notify.ts "message text" --channel C0OTHER123
 */

const slackToken = process.env.SLACK_BOT_TOKEN;
const DEFAULT_CHANNEL = "C0AFFHYJS2V"; // #scout-updates

const args = process.argv.slice(2);
const message = args[0];
const channelIdx = args.indexOf("--channel");
const channel =
  channelIdx !== -1 && args[channelIdx + 1]
    ? args[channelIdx + 1]
    : DEFAULT_CHANNEL;

if (!message) {
  console.error(
    'Usage: SLACK_BOT_TOKEN=... bun run scripts/slack-notify.ts "message" [--channel CHANNEL_ID]',
  );
  process.exit(1);
}

if (!slackToken) {
  console.error(
    "Missing SLACK_BOT_TOKEN. Set it in the environment before running scripts/slack-notify.ts.",
  );
  process.exit(1);
}

const res = await fetch("https://slack.com/api/chat.postMessage", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${slackToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ channel, text: message, unfurl_links: false }),
});

const data = (await res.json()) as { ok: boolean; error?: string };
if (data.ok) {
  console.log("✅ Sent");
} else {
  console.error(`❌ Error: ${data.error}`);
  process.exit(1);
}
