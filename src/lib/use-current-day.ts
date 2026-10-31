import { useEffect, useState } from "react";
import { today } from "./format";

export function useCurrentDay() {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const update = () => setDay(today());
    const timer = setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return day;
}
