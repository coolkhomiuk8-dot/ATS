// Shared fuel-consumption tracking logic used by samsaraCron + samsaraSync.
//
// Strategy: accumulate Δfuel% and Δodom between consecutive snapshots.
//   −Δfuel + +Δodom  → consumption (count toward MPG)
//   +Δfuel + 0 Δodom → refuel (count toward gallons added)
//   small/conflicting deltas → ignore as sensor noise

const HISTORY_CAP   = 2000;   // ~30–60 days of meaningful change events
const MIN_FUEL_DELTA = 1;     // ignore <1% sloshing
const MIN_ODOM_DELTA = 1;     // ignore <1 mile

/**
 * Append a snapshot only if fuel% or odom changed enough.
 * Returns the (possibly trimmed) new history array, or null if no change.
 */
function appendSnapshot(prevHistory, snapshot) {
  const history = Array.isArray(prevHistory) ? prevHistory : [];
  const last = history[history.length - 1];

  if (last) {
    const dFuel = Math.abs((snapshot.fuel ?? last.fuel) - last.fuel);
    const dOdom = Math.abs((snapshot.odom ?? last.odom) - last.odom);
    if (dFuel < MIN_FUEL_DELTA && dOdom < MIN_ODOM_DELTA) return null;
  }

  const next = [...history, snapshot];
  return next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next;
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

export { appendSnapshot, computeStats, buildConsumption };
