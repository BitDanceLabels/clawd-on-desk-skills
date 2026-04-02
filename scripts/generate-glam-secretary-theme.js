#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SVG_DIR = path.join(__dirname, "..", "assets", "svg");

const palette = {
  hair: "#1F1020",
  hairHi: "#4A1F45",
  skin: "#F2C7B5",
  blush: "#E8A59B",
  blazer: "#101A23",
  blazerHi: "#183343",
  blouse: "#F8EFFA",
  skirt: "#141F2B",
  gold: "#C9A45C",
  rose: "#F07AA4",
  roseDeep: "#E04787",
  wine: "#A63E71",
  heel: "#8A2D47",
  line: "#3E2430",
  shadow: "#24171F",
  sparkle: "#B2FFF0",
  alert: "#FF587A",
  bubble: "#DFFFF9",
  eye: "#1C1115",
  cyan: "#74FFF0",
  cyanDeep: "#1ED7C8",
};

const files = fs
  .readdirSync(SVG_DIR)
  .filter((file) => file.endsWith(".svg"));

function writeSvg(fileName, content) {
  fs.writeFileSync(path.join(SVG_DIR, fileName), `${content}\n`, "utf8");
}

function bubble(content, transform = "translate(-4 -9)") {
  return `
  <g transform="${transform}">
    <ellipse cx="8" cy="5" rx="7" ry="5" fill="${palette.bubble}" opacity="0.96"/>
    <path d="M12 8 L14 11 L10 9 Z" fill="${palette.bubble}" opacity="0.96"/>
    ${content}
  </g>`;
}

function sparkles() {
  return `
  <g fill="${palette.sparkle}" opacity="0.95">
    <rect x="-1" y="2" width="1.2" height="3"/>
    <rect x="-1.9" y="2.9" width="3" height="1.2"/>
    <rect x="16.8" y="3.3" width="1" height="2.6"/>
    <rect x="16" y="4.1" width="2.6" height="1"/>
  </g>`;
}

function matrixAura(mini) {
  const y = mini ? 8.9 : 10.2;
  const width = mini ? 10.4 : 12.2;
  return `
  <g opacity="${mini ? 0.18 : 0.14}">
    <path d="M${7.6 - width / 2} ${y} H${7.6 + width / 2}" stroke="${palette.cyan}" stroke-width="0.28" stroke-linecap="round"/>
    <path d="M${7.6 - width / 2 + 1.1} ${y + 0.8} H${7.6 + width / 2 - 1.4}" stroke="${palette.rose}" stroke-width="0.2" stroke-linecap="round"/>
    <path d="M${7.6 - width / 2 + 2.3} ${y + 1.5} H${7.6 + width / 2 - 2.1}" stroke="${palette.cyanDeep}" stroke-width="0.18" stroke-linecap="round"/>
  </g>`;
}

function figure({
  pose = "idle",
  mini = false,
  eyesClosed = false,
  eyesHappy = false,
  mouth = "soft",
  addBubble = "",
  addAccessory = "",
  extraForeground = "",
  eyeTrack = false,
  bodyTilt = 0,
  bodyShiftY = 0,
  shadowScale = 1,
  wink = false,
}) {
  const viewBox = mini ? "-10 -16 30 30" : "-15 -25 45 45";
  const heelY = mini ? 0 : 0;
  const bodyGroupId = eyeTrack ? ' id="body-js"' : "";
  const shadowId = eyeTrack ? ' id="shadow-js"' : "";
  const eyesId = eyeTrack ? ' id="eyes-js"' : "";
  const bodyTransform = `translate(0 ${bodyShiftY}) rotate(${bodyTilt} 7.5 9.5)`;
  const shadowWidth = mini ? 8 : 9;
  const shadowX = mini ? 3.5 : 3;
  const legY = mini ? 10 : 10.7;
  const skirtY = mini ? 4.6 : 5.2;
  const hairTailY = mini ? 2.4 : 1.9;
  const chestY = mini ? 4.2 : 4;
  const headCx = 7.6;
  const headCy = mini ? 2.8 : 2.6;
  const eyeY = mini ? 1.6 : 1.4;

  const eyeMarkup = eyesClosed
    ? `
      <g${eyesId} stroke="${palette.eye}" stroke-width="0.45" fill="none">
        <path d="M4.8 ${eyeY + 0.55} q0.8 -0.7 1.6 0"/>
        <path d="M9.7 ${eyeY + 0.55} q0.8 -0.7 1.6 0"/>
      </g>`
    : eyesHappy
      ? `
      <g${eyesId} stroke="${palette.eye}" stroke-width="0.5" fill="none">
        <path d="M4.7 ${eyeY + 0.6} q0.95 -0.95 1.9 0"/>
        <path d="M9.5 ${eyeY + 0.6} q0.95 -0.95 1.9 0"/>
      </g>`
      : `
      <g${eyesId} fill="${palette.eye}">
        <ellipse cx="5.6" cy="${eyeY}" rx="${wink ? 0.18 : 0.42}" ry="${wink ? 0.18 : 0.6}"/>
        <ellipse cx="10.6" cy="${eyeY}" rx="0.42" ry="0.6"/>
      </g>`;

  const mouthMarkup =
    mouth === "smile"
      ? `<path d="M6.2 4.45 q1.2 1 2.6 0" stroke="${palette.roseDeep}" stroke-width="0.45" fill="none" stroke-linecap="round"/>`
      : mouth === "open"
        ? `<ellipse cx="7.5" cy="4.8" rx="0.8" ry="0.95" fill="${palette.roseDeep}" opacity="0.9"/>`
        : mouth === "pout"
          ? `<path d="M6.5 4.7 q1 -0.45 2 0" stroke="${palette.roseDeep}" stroke-width="0.42" fill="none" stroke-linecap="round"/>`
          : `<path d="M6.55 4.6 q1 0.45 1.95 0" stroke="${palette.roseDeep}" stroke-width="0.4" fill="none" stroke-linecap="round"/>`;

  const armPose =
    pose === "typing"
      ? `
        <path d="M1.5 8.2 L4.8 8.6 L5.6 7.4 L2.8 7 Z" fill="${palette.skin}"/>
        <path d="M12.4 8.6 L15.4 8.1 L14.2 7 L11.7 7.5 Z" fill="${palette.skin}"/>`
      : pose === "attention" || pose === "notification"
        ? `
        <path d="M1.8 7.8 L4.2 6.1 L5.1 7.1 L2.6 8.8 Z" fill="${palette.skin}"/>
        <path d="M11.9 7.2 L14.8 5.2 L15.4 6.4 L12.7 8.2 Z" fill="${palette.skin}"/>`
        : pose === "sleep"
          ? `
        <path d="M1.7 8.2 L4.5 9.4 L5.3 8.4 L2.4 7.2 Z" fill="${palette.skin}"/>
        <path d="M11.7 8.2 L14.4 8.8 L14.6 7.6 L12.1 7.2 Z" fill="${palette.skin}"/>`
          : pose === "reading"
            ? `
        <path d="M1.8 8.2 L5.4 9.5 L5.8 8.2 L2.5 6.9 Z" fill="${palette.skin}"/>
        <path d="M11.4 8.8 L14.1 9.7 L14.8 8.6 L12.2 7.4 Z" fill="${palette.skin}"/>`
            : `
        <path d="M1.4 7.8 L4.4 8.9 L5.4 7.4 L2.4 6.3 Z" fill="${palette.skin}"/>
        <path d="M12 8.7 L14.7 7.9 L14.1 6.3 L11.6 7.1 Z" fill="${palette.skin}"/>`;

  const accessoryMarkup = (() => {
    switch (pose) {
      case "typing":
        return `
          <g transform="translate(0 9.4)">
            <rect x="1.8" y="0" width="11.6" height="3.3" rx="0.8" fill="#D9B76D"/>
            <rect x="2.4" y="0.5" width="10.4" height="2.1" rx="0.4" fill="#3B2631"/>
            <rect x="6.1" y="2.6" width="2.8" height="1" rx="0.4" fill="#A96C80"/>
          </g>`;
      case "reading":
        return `
          <g transform="translate(3.4 8.3) rotate(-9 3 3)">
            <rect x="0" y="0" width="5.9" height="7.1" rx="0.65" fill="${palette.blouse}" stroke="${palette.gold}" stroke-width="0.3"/>
            <path d="M3 0.2 V6.8" stroke="${palette.gold}" stroke-width="0.28"/>
            <path d="M1.1 2.1 H2.5 M3.5 2.1 H4.8 M1.1 3.3 H2.4 M3.6 3.3 H4.8 M1.1 4.5 H2.6 M3.4 4.5 H4.7" stroke="${palette.rose}" stroke-width="0.22" stroke-linecap="round"/>
          </g>`;
      case "notification":
        return `
          <g transform="translate(10 5.7) rotate(9 2 3)">
            <rect x="0" y="0" width="3.9" height="6.8" rx="0.85" fill="#2B2430"/>
            <rect x="0.45" y="0.55" width="3" height="5.2" rx="0.55" fill="#FFD7E0"/>
            <circle cx="1.95" cy="6.15" r="0.3" fill="${palette.gold}"/>
          </g>`;
      case "building":
        return `
          <g transform="translate(3.1 8.2) rotate(-7 3 3)">
            <rect x="0" y="0" width="6.3" height="7.3" rx="0.65" fill="#FFF7E7" stroke="${palette.gold}" stroke-width="0.3"/>
            <path d="M1 1.5 H5.2 M1 3 H4.6 M1 4.5 H5.2 M1 6 H3.7" stroke="${palette.wine}" stroke-width="0.28" stroke-linecap="round"/>
          </g>`;
      default:
        return "";
    }
  })();

  const bubbleMarkup = addBubble ? bubble(addBubble) : "";
  const miniScale = mini ? `transform="translate(0 1) scale(0.95)"` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="500" height="500">
  <defs>
    <linearGradient id="hair-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.hairHi}"/>
      <stop offset="100%" stop-color="${palette.hair}"/>
    </linearGradient>
    <linearGradient id="blazer-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.blazerHi}"/>
      <stop offset="100%" stop-color="${palette.blazer}"/>
    </linearGradient>
    <linearGradient id="blouse-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.blouse}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${palette.cyan}" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="skirt-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.skirt}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${palette.blazerHi}" stop-opacity="0.78"/>
    </linearGradient>
    <filter id="glam-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="${mini ? 0.32 : 0.46}" flood-color="${palette.cyan}" flood-opacity="0.22"/>
      <feDropShadow dx="0" dy="0" stdDeviation="${mini ? 0.22 : 0.32}" flood-color="${palette.rose}" flood-opacity="0.18"/>
    </filter>
    <style>
      .body-float { transform-origin: 7.5px 10px; animation: bodyFloat 3.8s infinite ease-in-out; }
      .hair-sway { transform-origin: 7.5px 4.5px; animation: hairSway 4.8s infinite ease-in-out; }
      .sparkle-pulse { animation: sparklePulse 1.8s infinite ease-in-out; }
      .alert-pop { animation: alertPop 0.9s infinite ease-in-out; }
      .sleep-breathe { transform-origin: 7.5px 10px; animation: sleepBreathe 4.6s infinite ease-in-out; }
      .mini-hover { animation: miniHover 2.6s infinite ease-in-out; }
      @keyframes bodyFloat {
        0%,100% { transform: translate(0,0); }
        50% { transform: translate(0,0.65px); }
      }
      @keyframes hairSway {
        0%,100% { transform: rotate(0deg); }
        50% { transform: rotate(${mini ? -1 : -1.6}deg); }
      }
      @keyframes sparklePulse {
        0%,100% { opacity: 0.65; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.08); }
      }
      @keyframes alertPop {
        0%,100% { transform: translateY(0); }
        50% { transform: translateY(-0.7px); }
      }
      @keyframes sleepBreathe {
        0%,100% { transform: translate(0,0) scale(1,1); }
        50% { transform: translate(0,0.8px) scale(1.02,0.98); }
      }
      @keyframes miniHover {
        0%,100% { transform: translateY(0); }
        50% { transform: translateY(-0.8px); }
      }
    </style>
  </defs>
  ${bubbleMarkup}
  ${matrixAura(mini)}
  <g${shadowId} transform="translate(0 0) scale(${shadowScale} 1)">
    <ellipse cx="7.6" cy="${mini ? 13.1 : 15.1}" rx="${shadowWidth / 2}" ry="${mini ? 0.95 : 1.05}" fill="${palette.shadow}" opacity="${mini ? 0.34 : 0.28}"/>
  </g>
  <g ${miniScale}>
    <g${bodyGroupId} transform="${bodyTransform}" class="${pose === "sleep" ? "sleep-breathe" : mini ? "mini-hover" : "body-float"}" filter="url(#glam-glow)">
      <g class="hair-sway">
        <path d="M2.2 ${hairTailY} Q3.8 -2.4 7.5 -2.4 Q11.7 -2.4 13 2.1 L13 7.8 Q12.3 10.8 10.6 12.2 L9.6 12.2 L10 5.5 Q7.8 7.2 5.1 7.4 L4.7 12.2 L3.5 12.2 Q1.7 10.7 2.2 7.1 Z" fill="url(#hair-grad)"/>
        <path d="M2.9 0.3 Q7.2 -4.1 12.4 1.3 Q11.4 0.8 10.5 1.2 Q7.6 -1.6 4.4 1.7 Q3.4 1.2 2.9 0.3 Z" fill="${palette.hairHi}" opacity="0.88"/>
      </g>
      <ellipse cx="${headCx}" cy="${headCy}" rx="3.9" ry="4.45" fill="${palette.skin}"/>
      <ellipse cx="5.1" cy="3.2" rx="1.05" ry="0.55" fill="${palette.blush}" opacity="0.45"/>
      <ellipse cx="10.1" cy="3.2" rx="1.05" ry="0.55" fill="${palette.blush}" opacity="0.45"/>
      ${eyeMarkup}
      ${mouthMarkup}
      <path d="M4.35 -0.5 Q7.5 1.2 10.65 -0.5" stroke="${palette.hairHi}" stroke-width="0.42" fill="none" stroke-linecap="round"/>
      <path d="M3.3 6.1 L11.8 6.1 L12.7 ${mini ? 10.5 : 11.1} L2.4 ${mini ? 10.5 : 11.1} Z" fill="url(#blazer-grad)" fill-opacity="0.84"/>
      <path d="M5.55 ${chestY} L7.45 7.2 L9.4 ${chestY}" fill="url(#blouse-grad)" fill-opacity="0.82"/>
      <path d="M5.55 ${chestY} L7.45 7.2 L9.4 ${chestY}" stroke="${palette.gold}" stroke-width="0.22" fill="url(#blouse-grad)" fill-opacity="0.78"/>
      <path d="M6.65 4.7 H8.3" stroke="${palette.cyan}" stroke-width="0.35" stroke-linecap="round" opacity="0.75"/>
      <rect x="5.15" y="${skirtY}" width="4.8" height="${mini ? 5 : 5.7}" rx="0.6" fill="url(#skirt-grad)" fill-opacity="0.84"/>
      <path d="M5.15 ${skirtY + 0.3} Q7.55 ${skirtY + 1.3} 9.95 ${skirtY + 0.3}" stroke="${palette.cyan}" stroke-width="0.24" fill="none" opacity="0.72"/>
      ${armPose}
      <path d="M5.8 ${legY} L5.15 ${mini ? 13.1 : 14.8}" stroke="${palette.skin}" stroke-width="1.05" stroke-linecap="round"/>
      <path d="M9.25 ${legY} L10 ${mini ? 13.3 : 15}" stroke="${palette.skin}" stroke-width="1.05" stroke-linecap="round"/>
      <path d="M4.85 ${mini ? 13.1 : 14.8} Q5.8 ${mini ? 13.55 : 15.35} 6.6 ${mini ? 13.15 : 14.95}" stroke="${palette.heel}" stroke-width="0.82" stroke-linecap="round"/>
      <path d="M9.55 ${mini ? 13.35 : 15} Q10.65 ${mini ? 13.8 : 15.55} 11.55 ${mini ? 13.4 : 15.1}" stroke="${palette.heel}" stroke-width="0.82" stroke-linecap="round"/>
      ${accessoryMarkup}
      ${addAccessory}
    </g>
  </g>
  ${extraForeground}
  ${pose === "attention" || pose === "notification" || pose === "happy" ? sparkles() : ""}
</svg>`;
}

function variantSvg(fileName) {
  if (fileName === "clawd-idle-follow.svg") {
    return figure({ pose: "idle", eyeTrack: true, mouth: "soft" });
  }
  if (fileName === "clawd-idle-living.svg") {
    return figure({
      pose: "idle",
      mouth: "smile",
      addAccessory: `<g transform="translate(12.1 8.1)"><rect x="0" y="0" width="2.2" height="3.3" rx="0.5" fill="${palette.gold}"/><rect x="0.35" y="0.45" width="1.5" height="2.1" rx="0.3" fill="#6D3146"/></g>`,
    });
  }
  if (fileName === "clawd-idle-look.svg") {
    return figure({ pose: "idle", mouth: "soft", wink: true, bodyTilt: 2 });
  }
  if (fileName === "clawd-idle-reading.svg") {
    return figure({ pose: "reading", mouth: "soft", bodyTilt: -2 });
  }
  if (fileName === "clawd-working-thinking.svg") {
    return figure({
      pose: "idle",
      mouth: "soft",
      bodyTilt: 2,
      addBubble: `
        <circle cx="5.3" cy="4.9" r="1" fill="${palette.rose}" opacity="0.95"/>
        <circle cx="8" cy="4.9" r="1" fill="${palette.gold}" opacity="0.95"/>
        <circle cx="10.7" cy="4.9" r="1" fill="${palette.rose}" opacity="0.95"/>`,
    });
  }
  if (fileName === "clawd-working-typing.svg") {
    return figure({ pose: "typing", mouth: "soft" });
  }
  if (fileName === "clawd-working-building.svg") {
    return figure({ pose: "building", mouth: "soft" });
  }
  if (fileName === "clawd-working-juggling.svg") {
    return figure({
      pose: "attention",
      mouth: "smile",
      addAccessory: `
        <g fill="${palette.gold}" opacity="0.95">
          <circle cx="2.6" cy="5.4" r="1.1"/>
          <circle cx="12.8" cy="4.7" r="1.1"/>
          <circle cx="7.5" cy="1.2" r="1.15"/>
        </g>`,
    });
  }
  if (fileName === "clawd-working-conducting.svg") {
    return figure({
      pose: "attention",
      mouth: "smile",
      addAccessory: `<path d="M12.5 4.2 L15.6 1.8" stroke="${palette.gold}" stroke-width="0.55" stroke-linecap="round"/><circle cx="15.9" cy="1.55" r="0.55" fill="${palette.gold}"/>`,
      bodyTilt: -4,
    });
  }
  if (fileName === "clawd-working-sweeping.svg") {
    return figure({
      pose: "building",
      mouth: "soft",
      addAccessory: `<path d="M1.1 13.4 L4.1 7.3" stroke="${palette.gold}" stroke-width="0.48" stroke-linecap="round"/><path d="M0.2 13.8 Q1.9 15.1 4.4 13.5" fill="none" stroke="${palette.rose}" stroke-width="0.55" stroke-linecap="round"/>`,
    });
  }
  if (fileName === "clawd-working-debugger.svg") {
    return figure({
      pose: "reading",
      mouth: "soft",
      addBubble: `<rect x="5.1" y="3.8" width="5.8" height="2.2" rx="0.8" fill="${palette.sparkle}" opacity="0.95"/><circle cx="6.3" cy="4.9" r="0.45" fill="${palette.roseDeep}"/><circle cx="7.9" cy="4.9" r="0.45" fill="${palette.roseDeep}"/><circle cx="9.5" cy="4.9" r="0.45" fill="${palette.roseDeep}"/>`,
    });
  }
  if (fileName === "clawd-working-ultrathink.svg" || fileName === "clawd-working-wizard.svg") {
    return figure({
      pose: "idle",
      mouth: "soft",
      addBubble: `<path d="M7.8 1.7 L8.8 3.9 L11.3 4.2 L9.4 5.8 L10 8.1 L7.8 6.9 L5.6 8.1 L6.2 5.8 L4.3 4.2 L6.8 3.9 Z" fill="${palette.gold}"/>`,
    });
  }
  if (fileName === "clawd-happy.svg") {
    return figure({
      pose: "happy",
      mouth: "smile",
      eyesHappy: true,
      extraForeground: `<g class="sparkle-pulse"><path d="M2.5 1.5 C2 -0.4 5 -0.5 4.7 1.5 C4.6 2.5 3.5 3.4 3.6 3.5 C3.7 3.4 2.6 2.5 2.5 1.5 Z" fill="${palette.alert}"/><path d="M11.9 1.2 C11.4 -0.5 14.1 -0.6 13.9 1.2 C13.8 2.1 12.9 3 12.9 3 C12.9 3 12 2.1 11.9 1.2 Z" fill="${palette.rose}"/></g>`,
    });
  }
  if (fileName === "clawd-notification.svg") {
    return figure({
      pose: "notification",
      mouth: "open",
      addBubble: `<rect class="alert-pop" x="7.2" y="1.2" width="1.1" height="4.3" rx="0.4" fill="${palette.alert}"/><circle class="alert-pop" cx="7.75" cy="6.5" r="0.6" fill="${palette.alert}"/>`,
    });
  }
  if (fileName === "clawd-error.svg" || fileName === "clawd-react-annoyed.svg") {
    return figure({
      pose: "notification",
      mouth: "pout",
      bodyTilt: -3,
      addBubble: `<path d="M5.2 2.2 L10.6 7.7 M10.6 2.2 L5.2 7.7" stroke="${palette.alert}" stroke-width="0.8" stroke-linecap="round"/>`,
    });
  }
  if (fileName === "clawd-react-left.svg") {
    return figure({ pose: "idle", mouth: "smile", bodyTilt: -5 });
  }
  if (fileName === "clawd-react-right.svg") {
    return figure({ pose: "idle", mouth: "smile", bodyTilt: 5 });
  }
  if (fileName === "clawd-react-double.svg") {
    return figure({
      pose: "happy",
      mouth: "smile",
      eyesHappy: true,
      extraForeground: `<g class="sparkle-pulse"><circle cx="2.2" cy="3" r="1.1" fill="${palette.alert}"/><circle cx="13.6" cy="2.4" r="1.1" fill="${palette.rose}"/></g>`,
    });
  }
  if (fileName === "clawd-react-double-jump.svg") {
    return figure({
      pose: "happy",
      mouth: "smile",
      eyesHappy: true,
      bodyShiftY: -1.4,
      shadowScale: 0.84,
      extraForeground: `<g class="sparkle-pulse"><path d="M2.3 4.2 L4.5 2.1" stroke="${palette.gold}" stroke-width="0.5"/><path d="M11.7 2.1 L14.2 4.6" stroke="${palette.gold}" stroke-width="0.5"/></g>`,
    });
  }
  if (fileName === "clawd-react-drag.svg") {
    return figure({
      pose: "notification",
      mouth: "open",
      bodyTilt: 7,
      addAccessory: `<path d="M14.4 4.1 L16.8 2.4" stroke="${palette.gold}" stroke-width="0.55" stroke-linecap="round"/>`,
    });
  }
  if (fileName === "clawd-idle-yawn.svg") {
    return figure({ pose: "sleep", mouth: "open", bodyTilt: 2, bodyShiftY: 0.6 });
  }
  if (fileName === "clawd-idle-doze.svg") {
    return figure({
      pose: "sleep",
      eyesClosed: true,
      mouth: "soft",
      bodyTilt: 5,
      bodyShiftY: 1.2,
      addBubble: `<text x="6.1" y="6.2" font-size="3.2" fill="${palette.roseDeep}" font-family="Georgia, serif">Z</text>`,
    });
  }
  if (fileName === "clawd-collapse-sleep.svg" || fileName === "clawd-idle-collapse.svg" || fileName === "clawd-sleeping.svg") {
    return figure({
      pose: "sleep",
      eyesClosed: true,
      mouth: "soft",
      bodyTilt: 10,
      bodyShiftY: 2.1,
      addBubble: `<text x="5.2" y="6.2" font-size="3.2" fill="${palette.roseDeep}" font-family="Georgia, serif">Zz</text>`,
    });
  }
  if (fileName === "clawd-wake.svg") {
    return figure({
      pose: "attention",
      mouth: "open",
      addBubble: `<path d="M7.5 1.4 L8.5 3.9 L11 4.2 L9 5.7 L9.6 8.2 L7.5 6.9 L5.4 8.2 L6 5.7 L4 4.2 L6.5 3.9 Z" fill="${palette.alert}"/>`,
    });
  }
  if (fileName.startsWith("clawd-mini-")) {
    const mode =
      fileName === "clawd-mini-alert.svg" ? "alert"
      : fileName === "clawd-mini-happy.svg" ? "happy"
      : fileName === "clawd-mini-sleep.svg" || fileName === "clawd-mini-enter-sleep.svg" ? "sleep"
      : "idle";
    return figure({
      pose: mode === "alert" ? "notification" : mode === "happy" ? "happy" : mode === "sleep" ? "sleep" : "idle",
      mini: true,
      eyeTrack: mode === "idle",
      eyesClosed: mode === "sleep",
      eyesHappy: mode === "happy",
      mouth: mode === "alert" ? "open" : mode === "happy" ? "smile" : "soft",
      bodyTilt: fileName === "clawd-mini-peek.svg" ? -4 : 0,
      addBubble: mode === "alert"
        ? `<rect class="alert-pop" x="7.2" y="1.5" width="1" height="3.7" rx="0.3" fill="${palette.alert}"/><circle class="alert-pop" cx="7.7" cy="5.8" r="0.55" fill="${palette.alert}"/>`
        : mode === "happy"
          ? `<path d="M6.3 1.8 C5.9 0.5 8 0.3 7.7 1.8 C7.6 2.5 7 3.1 7 3.1 C7 3.1 6.4 2.5 6.3 1.8 Z" fill="${palette.alert}"/>`
          : "",
    });
  }
  if (fileName === "clawd-static-base.svg") {
    return figure({ pose: "idle", mouth: "soft" });
  }
  return figure({ pose: "idle", mouth: "soft" });
}

for (const fileName of files) {
  writeSvg(fileName, variantSvg(fileName));
}

console.log(`Generated glam secretary theme for ${files.length} SVG files.`);
