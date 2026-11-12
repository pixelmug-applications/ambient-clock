import { BubbleBot, InlineKeyboard } from "@jeejio-bubble/bot/sdk";
import PixelMugS1 from "@jeejio-bubble/bot/devices/pixelmug-s1";

const mpsID = process.env.STUDIO_MPS_ID || "local-debug";
const mpsVersion = process.env.STUDIO_MPS_VERSION || "1.0.1";
const webAppUrl = launchUrl(requiredEnv("STUDIO_WEBAPP_URL"));

const messages = {
  "zh-CN": {
    bindContent: "绑定 PixelMug 后即可运行氛围时钟。",
    bindButton: "绑定 PixelMug",
    addedIntro: "你好，我是氛围时钟应用智能体。我的主要功能是帮助你为 PixelMug 选择时钟样式、时区、同步时钟音效和环境白噪音。在使用之前，请先绑定你的 PixelMug。",
    openButton: "打开氛围时钟",
    intro: "**氛围时钟**\n\n为 PixelMug 选择时钟样式、时区以及时钟音效或白噪音。\n\n点击下方按钮开始设置。",
    commands: "命令：/bindDevice，/ambientClock",
    commandBind: "绑定 PixelMug",
    commandAmbientClock: "打开氛围时钟",
  },
  "en-US": {
    bindContent: "Bind a PixelMug before running Ambient Clock.",
    bindButton: "Bind PixelMug",
    addedIntro: "Hello, I am the Ambient Clock app agent. I help you choose clock styles and time zones, and synchronize clock sounds or ambient noise with PixelMug. Before you start, please bind your PixelMug.",
    openButton: "Open Ambient Clock",
    intro: "**Ambient Clock**\n\nChoose a clock style, timezone, and synchronized clock sound or ambient noise for PixelMug.\n\nTap the button below to begin.",
    commands: "Commands: /bindDevice, /ambientClock",
    commandBind: "Bind PixelMug",
    commandAmbientClock: "Open Ambient Clock",
  },
};

const pixelMug = new PixelMugS1();
const bot = new BubbleBot(requiredEnv("BOT_TOKEN"), {
  apiBaseUrl: process.env.BOT_API_BASE_URL,    
  webAppDeviceAccess: "any",
});

bot.registerDevices([pixelMug]);
bot.on("error", async (ctx) => console.error("[ambient-clock-bot]", ctx.error || ctx));

bot.on("contact_added", async (ctx) => {
  await sendAddedIntro(ctx);
});

bot.on("joined_group", async (ctx) => {
  await sendAddedIntro(ctx, { mentionOnly: false });
});

bot.on("message", async (ctx) => {
  const language = localeFromContext(ctx);
  const command = extractCommand(ctx.message?.content || ctx.message?.text || "");

  if (command === "/bindDevice") {
    await sendBindDevice(ctx, language);
    return;
  }

  if (command === "/ambientClock" || command === "/webapp" || command === "/start") {
    const keyboard = new InlineKeyboard().url(text(language, "openButton"), withLocale(webAppUrl, language));
    await ctx.sendKeyboard(text(language, "intro"), keyboard, {
      mentionOnly: ctx.chat?.type === "group" ? true : undefined,
    });
    return;
  }

  await ctx.sendText(text(language, "commands"));
});

await bot.setCommands([
  {
    command: "bindDevice",
    description: messages["en-US"].commandBind,
    descTranslations: {
      "zh-CN": messages["zh-CN"].commandBind,
      en: messages["en-US"].commandBind,
    },
  },
  {
    command: "ambientClock",
    description: messages["en-US"].commandAmbientClock,
    descTranslations: {
      "zh-CN": messages["zh-CN"].commandAmbientClock,
      en: messages["en-US"].commandAmbientClock,
    },
  },
]);

await bot.start();
console.log("mps-ambient-clock bot is running.");
console.log(`WebApp URL: ${webAppUrl}`);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function extractCommand(value) {
  const match = String(value || "").trim().match(/\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/);
  return match ? match[0].split("@")[0] : "";
}

function localeFromContext(ctx) {
  const source = String(ctx.chat?.language || ctx.from?.language || process.env.APP_LOCALE || "").toLowerCase();
  return source.startsWith("zh") ? "zh-CN" : "en-US";
}

function text(language, key) {
  return messages[language]?.[key] || messages["en-US"][key] || key;
}

function sendAddedIntro(ctx, options = {}) {
  const language = localeFromContext(ctx);
  return ctx.sendBindDevice({
    content: text(language, "addedIntro"),
    actionButtonTitle: text(language, "bindButton"),
    ...options,
  });
}

function sendBindDevice(ctx, language = localeFromContext(ctx)) {
  return ctx.sendBindDevice({
    content: text(language, "bindContent"),
    actionButtonTitle: text(language, "bindButton"),
  });
}

function launchUrl(value) {
  const url = new URL(value);
  url.searchParams.set("mps_id", mpsID);
  url.searchParams.set("mps_version", mpsVersion);
  return url.toString();
}

function withLocale(value, language) {
  const url = new URL(value);
  url.searchParams.set("lang", language);
  return url.toString();
}

