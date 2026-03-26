import { useEffect, useState } from "react";

const THEMES = ["normal", "hc", "dark"];
const LABELS = { normal: "☀", hc: "◑", dark: "🌙" };
const STORAGE_KEY = "ats-theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || "normal");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "normal") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return { theme, setTheme, THEMES, LABELS };
}
