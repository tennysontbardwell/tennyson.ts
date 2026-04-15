import * as c from "tennyson/lib/core/common";

import * as yaml from "yaml";

function makeMatch(replace: string, triggers: string | string[]) {
  return {
    replace,
    triggers: c.toArray(triggers).map((x) => `;${x};`),
  };
}

const m = makeMatch;

const sup = (trigger: string, replace: string) =>
  makeMatch(replace, `^${trigger}`);
const sub = (trigger: string, replace: string) =>
  makeMatch(replace, `_${trigger}`);

const matches = () => [
  // emoji ////////////////////////////////////////////////////////////////////
  m("\uFE0F", ["var16"]),

  m("🌸", ["flower"]),
  m("😊", ["smile", ":)"]),
  m("😘", ["kiss"]),
  m("😘", ["heart eyes"]),
  m("🥵", ["gasp"]),
  m("😠", ["grr"]),
  m("😇", ["angel"]),
  m("🥹", ["aww"]),
  m("😭", ["cry"]),
  m("😈️", ["devil"]),
  m("👀", ["eyes", "looking"]),
  m("🎉🥳", ["party"]),
  m("❤️", ["heart", "<3"]),
  m("🎂️", ["birthday", "bday"]),
  m("🫡️", ["yessir", "sir"]),
  m("🤞", ["crossed"]),
  m("🖕", ["finger"]),

  m("ℹ️", ["info"]),
  m("⚠️", ["warn"]),
  m("🛑️", ["stop"]),
  m("✅", ["check", "done", "checkmark"]),
  m("⭐", ["star"]),
  m("🆘", ["sos"]),
  m("❓", ["?"]),
  m("🚨", ["alert"]),
  m("⏰", ["alarm"]),
  m("📌", ["pin"]),
  m("💀", ["skull"]),
  m("❌", ["x", "cross"]),
  m("🍰", ["cake"]),
  m("💡", ["idea", "lightbulb", "bulb"]),

  m("☀️", ["sun"]),
  m("🌊", ["wave", "ocean"]),
  m("🌱", ["seedling", "plant"]),
  m("💧", ["droplet", "water"]),
  m("🔥", ["fire"]),
  m("🧊", ["ice"]),
  m("❄️", ["snow"]),
  m("⚡️", ["volt", "power"]),

  m("🐈‍⬛", ["cat"]),
  m("🐶", ["dog"]),

  m("✉️", ["mail"]),
  m("🔑️", ["key"]),
  m("🎵", ["music"]),
  m("🏃", ["run"]),
  m("📞", ["phone", "call"]),
  m("📁", ["file"]),
  m("🤖️", ["robot"]),
  m("🔒", ["lock"]),
  m("💪️", ["flex", "strong"]),
  m("🗽", ["nyc"]),
  m("✈️", ["airplane", "plane", "flight"]),
  m("🚕", ["taxi"]),
  m("🚗", ["car"]),
  m("🌮", ["taco"]),
  m("💼", ["briefcase"]),
  m("🎮", ["game"]),

  m("📈️", ["bull", "stock"]),
  m("📉", ["bust"]),
  m("💻", ["laptop"]),
  m("🛠️", ["tools"]),
  m("🔄", ["sync"]),
  m("🧵", ["thread"]),
  m("⚙️.", ["gear️"]),

  ...Object.entries({
    white: ["🤍", "⬜", "⚪"],
    black: ["🖤", "⬛", "⚫"],
    red: ["❤️", "🟥", "🔴"],
    orange: ["🧡", "🟧", "🟠"],
    yellow: ["💛", "🟨", "🟡"],
    green: ["💚", "🟩", "🟢"],
    blue: ["💙", "🟦", "🔵"],
    purple: ["💜", "🟪", "🟣"],
    brown: ["🤎", "🟫", "🟤"],
  }).flatMap(([k, [h, s, c]]: [string, string[]]) => [
    m(h, [`${k} heart`]),
    m(s, [`${k}`, `${k} square`]),
    m(c, [`${k} circle`]),
  ]),

  ...Object.entries({
    grey: "🩶",
    pink: "🩷",
    "light blue": "🩵️",
  }).flatMap(([k, v]) => [m(v, [`${k} heart`]), m(v, [`${k}`])]),

  m("➡️", ["right"]),
  m("⬅️", ["left"]),
  m("⬆️", ["up"]),
  m("⬇️", ["down"]),

  // other ////////////////////////////////////////////////////////////////////

  m("™", ["tm", "trade"]),
  m("©", ["(c)", "copywrite"]),
  m("❤", ["uheart"]),
  m("✈", ["uplane"]),
  m("⚙", ["ugear️"]),
  m("✓", ["ucheck"]),
  m("✔", ["uhcheck"]),
  m("❄", ["usnow"]),
  m("ℹ", ["uinfo"]),
  m("⚠", ["uwarn"]),
  m("♛", ["queen"]),

  m("¢", ["cent"]),
  m("€", ["euro"]),
  m("₤", ["gbp"]),
  m("₿", ["bitcoin"]),
  m("¥", ["yen", "yuan"]),

  // math /////////////////////////////////////////////////////////////////////

  m("→", ["->", "east", "rightarrow"]),
  m("←", ["<-", "west", "leftarrow"]),
  m("↑", ["north"]),
  m("↓", ["south"]),
  m("↖", ["nw"]),
  m("↗", ["ne"]),
  m("↘", ["se"]),
  m("↙", ["sw"]),
  m("↔", ["iff", "<->"]),
  m("↦", ["mapsto"]),

  m("∀", ["forall"]),
  m("∃", ["exists"]),
  m("∈", ["in"]),
  m("∩", ["cap"]),
  m("∪", ["cup"]),
  m("⊆", ["subseteq"]),
  m("⊇", ["supseteq"]),
  m("⊈", ["nsubseteq"]),
  m("⊉", ["nsupseteq"]),
  m("⊂", ["subset"]),
  m("⊃", ["supset"]),
  m("⊄", ["nsubset"]),
  m("⊅", ["nsupset"]),
  m("⋀", ["land"]),
  m("⋁", ["lor"]),

  m("≤", ["leq"]),
  m("≥", ["geq"]),
  m("≥", ["neq"]),
  m("≽", ["succeq"]),
  m("≼", ["preceq"]),
  m("≻", ["succ"]),
  m("≺", ["prec"]),
  m("≈", ["approx"]),

  m("∇", ["nabla"]),
  m("∞", ["infty"]),
  m("∫", ["int"]),
  m("√", ["sqrt"]),

  m("±", ["pm", "plusminus"]),
  m("×", ["times"]),
  m("∏", ["Pi"]),
  m("∑", ["Sigma"]),
  m("∘", ["circ"]),
  m("⊕", ["oplus"]),
  m("⊖", ["ominus"]),
  m("⊗", ["otimes"]),
  m("⊘", ["oslash"]),
  m("⊙", ["odot"]),
  m("⋅", ["cdot"]),
  m("⨁", ["bigoplus"]),
  m("⨂", ["bigotimes"]),

  sup("alpha", "ᵅ"),
  sup("beta", "ᵝ"),
  sup("gamma", "ᵞ"),
  sup("delta", "ᵟ"),
  sup("epsilon", "ᵋ"),
  sup("theta", "ᶿ"),
  sup("phi", "ᵠ"),

  ...Object.entries(c.AlphaNumeric.latinSuperscript).map(([k, v]) => sup(k, v)),
  ...Object.entries(c.AlphaNumeric.latinSubscript).map(([k, v]) => sub(k, v)),

  ...c
    .zip(
      [
        ...c.AlphaNumeric.alphaMathBlackboardUpperCase,
        ...c.AlphaNumeric.numericMathBlackboard,
      ],
      [...c.AlphaNumeric.alphaLower, ...c.AlphaNumeric.numeric],
    )
    .map(([u, c]: [string, string]) => m(u, `bb ${c.toUpperCase()}`)),

  ...c
    .zip(
      [...c.AlphaNumeric.alphaMathBlackboardLowerCase],
      c.AlphaNumeric.alphaLower,
    )
    .map(([u, c]: [string, string]) => m(u, `bb ${c}`)),

  ...c
    .zip([...c.AlphaNumeric.alphaMathCal], c.AlphaNumeric.alphaLower)
    .map(([u, c]: [string, string]) => m(u, `cal ${c.toUpperCase()}`)),

  // greek
  m("β", ["beta"]),
  m("δ", ["delta"]),
  m("ε", ["epsilon"]),
  m("λ", ["lambda"]),
  m("μ", ["mu", "micro"]),
  m("π", ["pi"]),
  m("σ", ["sigma"]),
  m("∂", ["partial"]),
];

export function gen() {
  return "# autogenerated file\n\n" + yaml.stringify({ matches: matches() });
}
