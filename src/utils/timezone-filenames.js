const { createHash } = require("node:crypto");

// Keep the existing readable filename unless it is ambiguous on a
// case-insensitive filesystem. Colliding timezones receive stable suffixes.
function planTimezoneFilenames(timezones) {
  const groups = new Map();
  for (const timezone of new Set(timezones)) {
    const legacy = timezone.replace(/[^a-zA-Z0-9]/g, "-");
    const key = legacy.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ timezone, legacy });
  }

  const filenames = new Map();
  const aliases = [];
  for (const group of groups.values()) {
    group.sort((a, b) =>
      a.timezone < b.timezone ? -1 : a.timezone > b.timezone ? 1 : 0,
    );
    for (const item of group) {
      const suffix =
        group.length > 1
          ? `--${createHash("sha256").update(item.timezone).digest("hex").slice(0, 12)}`
          : "";
      filenames.set(item.timezone, `${item.legacy}${suffix}`);
    }
    if (group.length > 1) aliases.push(group[0]);
  }
  return { filenames, aliases };
}

module.exports = { planTimezoneFilenames };
