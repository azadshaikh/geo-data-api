const config = require("../config");

function releaseTimestamp() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  let date;
  if (epoch !== undefined) {
    if (!/^\d+$/.test(epoch)) throw new Error("SOURCE_DATE_EPOCH must be a non-negative integer");
    date = new Date(Number(epoch) * 1000);
  } else {
    date = new Date(config.RELEASE_TIMESTAMP);
  }
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid release timestamp");
  return date.toISOString();
}

module.exports = { releaseTimestamp };
