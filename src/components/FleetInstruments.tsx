import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, Gauge, Route } from "lucide-react";
import { Link } from "react-router-dom";
import type { Period, Truck } from "../domain/models";
import { monthLabel, number, percent } from "../lib/format";

const clockFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const calendarFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function OperationsClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = clockFormat.formatToParts(now);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)?.value ?? 0);
  const hour = part("hour"),
    minute = part("minute"),
    second = part("second");
  return (
    <article className="instrument-module clock-module">
      <div className="instrument-label">
        <Clock3 size={16} />
        <h3>Hora de operación</h3>
        <span className="instrument-tag">MADRID</span>
      </div>
      <div className="clock-display">
        <svg viewBox="0 0 172 164" className="analog-clock" aria-hidden="true">
          <circle cx="86" cy="82" r="67" className="dial-bezel" />
          <circle cx="86" cy="82" r="61" className="dial-face" />
          {Array.from({ length: 60 }, (_, i) => (
            <line
              key={i}
              x1="86"
              y1="26"
              x2="86"
              y2={i % 5 === 0 ? "34" : "29"}
              transform={`rotate(${i * 6} 86 82)`}
              className={i % 5 === 0 ? "dial-tick major" : "dial-tick"}
            />
          ))}
          <text x="86" y="49" textAnchor="middle" className="clock-hour-label">
            12
          </text>
          <text x="125" y="86" textAnchor="middle" className="clock-hour-label">
            3
          </text>
          <text x="86" y="125" textAnchor="middle" className="clock-hour-label">
            6
          </text>
          <text x="47" y="86" textAnchor="middle" className="clock-hour-label">
            9
          </text>
          <line
            x1="86"
            y1="86"
            x2="86"
            y2="51"
            transform={`rotate(${hour * 30 + minute / 2} 86 82)`}
            className="clock-hand hour-hand"
          />
          <line
            x1="86"
            y1="87"
            x2="86"
            y2="38"
            transform={`rotate(${minute * 6 + second / 10} 86 82)`}
            className="clock-hand minute-hand"
          />
          <line
            x1="86"
            y1="94"
            x2="86"
            y2="32"
            transform={`rotate(${second * 6} 86 82)`}
            className="clock-second-hand"
          />
          <circle cx="86" cy="82" r="5" className="dial-pivot" />
        </svg>
        <div className="clock-readout">
          <time dateTime={now.toISOString()}>{clockFormat.format(now)}</time>
          <span>Europe / Madrid</span>
          <small>{calendarFormat.format(now)}</small>
        </div>
      </div>
      <div className="instrument-footnote">Hora local actual · CET / CEST</div>
    </article>
  );
}

function gaugePoint(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: 90 + Math.cos(radians) * radius,
    y: 91 + Math.sin(radians) * radius,
  };
}

function AvailabilityGauge({ count, total }: { count: number; total: number }) {
  const ratio = total ? count / total : 0;
  const start = gaugePoint(150, 65),
    end = gaugePoint(390, 65);
  const value = gaugePoint(150 + ratio * 240, 65);
  const needle = gaugePoint(150 + ratio * 240, 48);
  return (
    <svg
      viewBox="0 0 180 158"
      className="availability-dial"
      role="img"
      aria-label={`Disponibilidad operativa: ${percent(ratio * 100)}. ${count} de ${total} vehículos operativos.`}
    >
      <path
        d={`M ${start.x} ${start.y} A 65 65 0 1 1 ${end.x} ${end.y}`}
        className="gauge-track"
      />
      {ratio > 0 && (
        <path
          d={`M ${start.x} ${start.y} A 65 65 0 ${ratio > 0.75 ? 1 : 0} 1 ${value.x} ${value.y}`}
          className="gauge-value"
        />
      )}
      {Array.from({ length: 13 }, (_, i) => {
        const outer = gaugePoint(150 + i * 20, 55),
          inner = gaugePoint(150 + i * 20, i % 3 === 0 ? 47 : 51);
        return (
          <line
            key={i}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            className={`gauge-tick ${i % 3 === 0 ? "major" : ""}`}
          />
        );
      })}
      <text x="32" y="148" textAnchor="middle" className="gauge-scale">
        0
      </text>
      <text x="90" y="12" textAnchor="middle" className="gauge-scale">
        50
      </text>
      <text x="149" y="148" textAnchor="middle" className="gauge-scale">
        100
      </text>
      <line
        x1="90"
        y1="91"
        x2={needle.x}
        y2={needle.y}
        className="gauge-needle"
      />
      <circle cx="90" cy="91" r="6" className="gauge-pivot" />
      <text x="90" y="133" textAnchor="middle" className="gauge-number">
        {Math.round(ratio * 100)}
        <tspan className="gauge-percent"> %</tspan>
      </text>
    </svg>
  );
}

export function FleetInstruments({
  trucks,
  distanceKm,
  period,
}: {
  trucks: Truck[];
  distanceKm: number;
  period: Period;
}) {
  const totalKm = trucks.reduce((sum, truck) => sum + truck.odometerKm, 0);
  const operational = trucks.filter(
    (truck) => truck.status !== "maintenance",
  ).length;
  const digits = String(totalKm).padStart(8, "0");
  return (
    <section
      className="fleet-instruments"
      aria-labelledby="fleet-instruments-heading"
    >
      <div className="instruments-heading">
        <div>
          <span className="console-kicker">CONTROL OPERATIVO</span>
          <h2 id="fleet-instruments-heading">El pulso de tu flota</h2>
        </div>
        <span className="console-source">
          <span />
          {trucks.length} vehículos seleccionados
        </span>
      </div>
      <div className="instrument-console">
        <OperationsClock />
        <article className="instrument-module odometer-module">
          <div className="instrument-label">
            <Gauge size={17} />
            <h3>Cuentakilómetros acumulado</h3>
          </div>
          <div className="odometer-readout">
            <div
              className="odometer-digits"
              role="img"
              aria-label={`Kilometraje acumulado: ${number(totalKm)} kilómetros`}
            >
              {digits.split("").map((digit, index) => (
                <span key={index} aria-hidden="true">
                  {digit}
                </span>
              ))}
            </div>
            <span className="odometer-unit" aria-hidden="true">
              km
            </span>
          </div>
          <p className="odometer-description">
            Suma de las lecturas de los vehículos seleccionados.
          </p>
          <div className="service-distance">
            <span className="distance-icon">
              <Route size={19} />
            </span>
            <div>
              <span>Kilómetros de servicio</span>
              <strong>
                {number(distanceKm)} <small>km</small>
              </strong>
            </div>
            <span className="distance-period">{monthLabel(period)}</span>
          </div>
          <Link className="instrument-link" to="/trucks">
            Consultar vehículos <ArrowUpRight size={14} />
          </Link>
        </article>
        <article className="instrument-module gauge-module">
          <div className="instrument-label">
            <Gauge size={17} />
            <h3>Disponibilidad de la flota</h3>
          </div>
          <div className="availability-display">
            <AvailabilityGauge count={operational} total={trucks.length} />
            <div className="gauge-summary">
              <strong>
                {operational}
                <span> / {trucks.length}</span>
              </strong>
              <span>vehículos operativos</span>
              <small>En ruta o disponibles</small>
            </div>
          </div>
          <div className="instrument-footnote">
            Según el estado registrado de los vehículos
          </div>
        </article>
      </div>
    </section>
  );
}
