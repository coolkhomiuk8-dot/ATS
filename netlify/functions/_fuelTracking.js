// Shared fuel-consumption + mileage tracking logic used by samsaraCron + samsaraSync.
//
// Strategy: accumulate Δfuel% and Δodom between consecutive snapshots.
//   −Δfuel + +Δodom  → consumption (count toward MPG)
//   +Δfuel + 0 Δodom → refuel (count toward gallons added)
//   small/conflicting deltas → ignore as sensor noise

const HISTORY_CAP   = 2000;   // ~30–60 days of meaningful change events
const MIN_FUEL_DELTA = 1;     // ignore <1% sloshing
const MIN_ODOM_DELTA = 1;     // ignore <1 mile
const TZ            = "America/New_York";  // EST/EDT

/**
 * Append a snapshot only if fuel% or odom changed enough.
 * Allows null fuel — useful for trucks without a fuel sensor (we still track odom).
 * Returns the (possibly trimmed) new history array, or null if no change.
 */
function appendSnapshot(prevHistory, snapshot) {
  const history = Array.isArray(prevHistory) ? prevHistory : [];
  const last = history[history.length - 1];

  if (last) {
    const dFuel = (snapshot.fuel != null && last.fuel != null)
      ? Math.abs(snapshot.fuel - last.fuel) : 0;
    const dOdom = (snapshot.odom != null && last.odom != null)
      ? Math.abs(snapshot.odom - last.odom) : 0;
    if (dFuel < MIN_FUEL_DELTA && dOdom < MIN_ODOM_DELTA) return null;
  }

  const next = [...history, snapshot];
  return next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next;
}

/**
 * Compute UTC ISO timestamps for EST period boundaries: today/this week/this month.
 *  • Day:   00:00 EST today
 *  • Week:  00:00 EST Monday this week
 *  • Month: 00:00 EST 1st of this month
 * Handles DST automatically via Intl.
 */
function periodBoundariesEST(reference = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(reference).map((p) => [p.type, p.value]));
  const y = +parts.year, m = +parts.month, d = +parts.day;
  const wdMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysFromMonday = wdMap[parts.weekday] ?? 0;

  // Convert EST midnight to actual UTC ISO, accounting for DST.
  function estMidnightIso(yy, mm, dd) {
    // Probe the offset for that date by formatting noon UTC in EST.
    const noonUtc = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
    const noonEst = noonUtc.toLocaleString("en-US", {
      timeZone: TZ, hour: "2-digit", hour12: false,
    });
    const offsetHours = 12 - parseInt(noonEst, 10); // 5 (EST) or 4 (EDT)
    return new Date(Date.UTC(yy, mm - 1, dd, offsetHours, 0, 0)).toISOString();
  }

  // Roll back day-of-month for week start
  let wY = y, wM = m, wD = d - daysFromMonday;
  while (wD < 1) {
    wM -= 1;
    if (wM < 1) { wM = 12; wY -= 1; }
    wD += new Date(wY, wM, 0).getDate();
  }

  return {
    dayStart:   estMidnightIso(y, m, d),
    weekStart:  estMidnightIso(wY, wM, wD),
    monthStart: estMidnightIso(y, m, 1),
  };
}

/**
 * Miles driven since a given period start, based on snapshot history.
 * Baseline = last snapshot before the period, or first snapshot in period.
 */
function milesInPeriod(history, periodStartIso) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  const latestOdom = history[history.length - 1].odom;
  if (latestOdom == null) return 0;

  let baseline = null;
  for (const s of history) {
    if (s.odom == null) continue;
    if (s.time < periodStartIso) baseline = s;
    else if (!baseline) baseline = s;
  }
  if (!baseline) return 0;
  return Math.max(0, latestOdom - baseline.odom);
}

/**
 * Build per-period mileage summary (today / this week / this month, EST).
 */
function buildMileage(history) {
  const b = periodBoundariesEST();
  return {
    today:     milesInPeriod(history, b.dayStart),
    thisWeek:  milesInPeriod(history, b.weekStart),
    thisMonth: milesInPeriod(history, b.monthStart),
    dayStart:   b.dayStart,
    weekStart:  b.weekStart,
    monthStart: b.monthStart,
    updated:   new Date().toISOString(),
  };
}

/**
 * Compute MPG / gallon stats over the last `daysBack` days.
 * Returns null if insufficient data.
 */
function computeStats(history, tankCapacity, daysBack) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const cap = Number(tankCapacity) || 25;
  const cutoff = Date.now() - daysBack * 24 * 3600 * 1000;
  const recent = history.filter((s) => new Date(s.time).getTime() >= cutoff);
  if (recent.length < 2) return null;

  let consumedPct = 0;
  let addedPct    = 0;
  let miles       = 0;
  let refuelEvents = 0;

  for (let i = 1; i < recent.length; i++) {
    const a = recent[i - 1];
    const b = recent[i];
    const dFuel = (b.fuel ?? 0) - (a.fuel ?? 0);
    const dOdom = (b.odom ?? 0) - (a.odom ?? 0);

    // Fuel went down + truck moved → consumption
    if (dFuel < 0 && dOdom > 0) {
      consumedPct += -dFuel;
      miles       += dOdom;
    }
    // Fuel went up + truck mostly stationary → refuel
    else if (dFuel >= 5 && dOdom <= 1) {
      addedPct    += dFuel;
      refuelEvents += 1;
    }
    // Anything else (small noise, fuel up while moving) → skip
  }

  const consumedGal = (consumedPct / 100) * cap;
  const addedGal    = (addedPct    / 100) * cap;
  const mpg         = consumedGal > 0 ? miles / consumedGal : null;

  return {
    miles:    Math.round(miles),
    consumed: Math.round(consumedGal * 10) / 10,
    added:    Math.round(addedGal    * 10) / 10,
    mpg:      mpg != null ? Math.round(mpg * 10) / 10 : null,
    refuels:  refuelEvents,
  };
}

/**
 * Build the consumption summary stored on the truck.
 */
function buildConsumption(history, tankCapacity) {
  const s7  = computeStats(history, tankCapacity, 7);
  const s30 = computeStats(history, tankCapacity, 30);
  return {
    mpg7d:       s7?.mpg ?? null,
    mpg30d:      s30?.mpg ?? null,
    miles7d:     s7?.miles ?? 0,
    miles30d:    s30?.miles ?? 0,
    gallons7d:   s7?.consumed ?? 0,
    gallons30d:  s30?.consumed ?? 0,
    added7d:     s7?.added ?? 0,
    added30d:    s30?.added ?? 0,
    refuels7d:   s7?.refuels ?? 0,
    refuels30d:  s30?.refuels ?? 0,
    lastUpdated: new Date().toISOString(),
  };
}

export { appendSnapshot, computeStats, buildConsumption, buildMileage, periodBoundariesEST };
