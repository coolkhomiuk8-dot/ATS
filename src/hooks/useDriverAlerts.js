import { useEffect, useRef, useState } from "react";
import { minutesUntil } from "../utils/date";

const ALERT_BEFORE_MINS = 3;
const CHECK_INTERVAL_MS = 30_000;

export function useDriverAlerts(drivers) {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const firedRef = useRef(new Set());

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    function check() {
      drivers.forEach((driver) => {
        if (!driver.nextAction) return;
        const mins = minutesUntil(driver);
        if (mins === null) return;

        const key = `${driver.id}-${driver.nextAction}-${driver.nextActionTime}`;

        if (mins >= 0 && mins <= ALERT_BEFORE_MINS && !firedRef.current.has(key)) {
          firedRef.current.add(key);

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`⏰ Action due soon: ${driver.name}`, {
              body: `Next action in ${mins} min · ${driver.nextActionTime}`,
              requireInteraction: true,
              tag: key,
            });
          }

          setActiveAlerts((prev) => {
            if (prev.some((a) => a.key === key)) return prev;
            return [...prev, { key, driver: { ...driver } }];
          });
        }
      });
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [drivers]);

  function dismissAlert(key) {
    setActiveAlerts((prev) => prev.filter((a) => a.key !== key));
  }

  return { activeAlerts, dismissAlert };
}
