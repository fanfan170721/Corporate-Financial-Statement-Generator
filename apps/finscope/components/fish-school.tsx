"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CompanyMark from "./company-mark";
import "./fish-school.css";

type FishCompany = { symbol: string; name: string; nameEn?: string; color?: string; mark?: string };
type FishSchoolProps = {
  compact?: boolean;
  companies?: FishCompany[];
  onCompanyClick?: (symbol: string) => void;
};
type Fish = { x: number; y: number; vx: number; vy: number; radius: number; phase: number; angle: number; index: number; fed: number };
type Food = { x: number; y: number; age: number; pink: boolean; drift: number };
type Ripple = { x: number; y: number; age: number; eaten?: boolean };

// A familiar illustrative school, not a live market-cap ranking.
const DEFAULT_COMPANIES: FishCompany[] = [
  { symbol: "NVDA", name: "NVIDIA", color: "#76b900" },
  { symbol: "AAPL", name: "Apple", color: "#202833" },
  { symbol: "MSFT", name: "Microsoft", color: "#737373" },
  { symbol: "GOOGL", name: "Alphabet", color: "#4285f4" },
  { symbol: "AMZN", name: "Amazon", color: "#232f3e" },
  { symbol: "META", name: "Meta", color: "#0866ff" },
  { symbol: "TSLA", name: "Tesla", color: "#e82127" },
  { symbol: "AVGO", name: "Broadcom", color: "#cc092f" },
  { symbol: "TSM", name: "TSMC", color: "#ca2934" },
  { symbol: "BRK.B", name: "Berkshire Hathaway", mark: "B", color: "#294e66" },
  { symbol: "WMT", name: "Walmart", color: "#0071ce" },
  { symbol: "JPM", name: "JPMorgan Chase", mark: "JPM", color: "#274e73" },
  { symbol: "LLY", name: "Eli Lilly", color: "#d52b1e" },
  { symbol: "V", name: "Visa", color: "#1a1f71" },
  { symbol: "ORCL", name: "Oracle", color: "#f80000" },
  { symbol: "MA", name: "Mastercard", color: "#f79e1b" },
  { symbol: "XOM", name: "ExxonMobil", mark: "X", color: "#d71920" },
  { symbol: "COST", name: "Costco", mark: "C", color: "#d32b2a" },
  { symbol: "NFLX", name: "Netflix", color: "#e50914" },
  { symbol: "SAP", name: "SAP", color: "#008fd3" },
  { symbol: "JNJ", name: "Johnson & Johnson", mark: "J&J", color: "#d51920" },
  { symbol: "PG", name: "Procter & Gamble", mark: "P&G", color: "#174c99" },
  { symbol: "ASML", name: "ASML", color: "#2456a8" },
  { symbol: "BAC", name: "Bank of America", mark: "BA", color: "#dc2334" },
  { symbol: "HD", name: "Home Depot", mark: "HD", color: "#ed731d" },
  { symbol: "BABA", name: "Alibaba", color: "#ff6a00" },
  { symbol: "AMD", name: "AMD", color: "#252d35" },
  { symbol: "ADBE", name: "Adobe", color: "#fa0f00" },
  { symbol: "KO", name: "Coca-Cola", mark: "C", color: "#e32636" },
  { symbol: "DIS", name: "Disney", mark: "D", color: "#1b548b" },
];

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

export default function FishSchool({ compact = false, companies, onCompanyClick }: FishSchoolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<(HTMLSpanElement | null)[]>([]);
  const feedRef = useRef<() => void>(() => {});
  const clickRef = useRef(onCompanyClick);
  const [tooltip, setTooltip] = useState<{ company: FishCompany; x: number; y: number } | null>(null);
  const [feedCount, setFeedCount] = useState(0);
  const identities = useMemo(() => companies?.length ? companies.slice(0, 30) : DEFAULT_COMPANIES, [companies]);

  useEffect(() => { clickRef.current = onCompanyClick; }, [onCompanyClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = rootRef.current;
    if (!canvas || !container) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let width = 0;
    let height = 0;
    let fish: Fish[] = [];
    const foods: Food[] = [];
    const ripples: Ripple[] = [];
    let animationFrame = 0;
    let previous = 0;
    let elapsed = 0;
    let dark = document.documentElement.dataset.theme === "dark" || document.documentElement.classList.contains("dark");
    let hovered = -1;
    let disposed = false;
    let visible = true;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches || document.documentElement.dataset.reducedMotion === "true";

    function placeFish() {
      fish = identities.map((_, index) => {
        const major = index < 7;
        const angle = major ? index * Math.PI * 2 / 7 - .5 : index * 2.39996;
        const orbit = major ? .27 : .29 + (index % 4) * .045;
        const scale = compact ? .55 : clamp(width / 660, .68, 1.14);
        const radius = (major ? 27 + (index % 3) * 2 : 14 + (index % 4) * 2) * scale;
        return {
          x: width * (.5 + Math.cos(angle) * orbit),
          y: height * (.51 + Math.sin(angle) * orbit * .88),
          vx: -Math.sin(angle) * .3,
          vy: Math.cos(angle) * .21,
          radius,
          phase: index * 1.79,
          angle: angle + Math.PI / 2,
          index,
          fed: 0,
        };
      });
      for (const item of fish) {
        const mark = marksRef.current[item.index];
        if (mark) mark.style.setProperty("--fish-size", `${item.radius * 1.56}px`);
      }
    }

    function resize() {
      if (disposed || !canvas || !container || !context) return;
      const bounds = container.getBoundingClientRect();
      const oldWidth = width;
      const oldHeight = height;
      width = bounds.width;
      height = bounds.height;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!fish.length || Math.abs(oldWidth - width) > 100) placeFish();
      else for (const item of fish) {
        item.x *= width / oldWidth;
        item.y *= height / oldHeight;
      }
      draw();
    }

    function drawWater() {
      if (!context) return;
      context.save();
      context.translate(width * .5, height * .51);
      context.strokeStyle = dark ? "rgba(107, 147, 185, .09)" : "rgba(125, 168, 187, .12)";
      context.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        context.beginPath();
        context.ellipse(0, 0, width * (.16 + i * .074), height * (.15 + i * .075), -.18, 0, Math.PI * 2);
        context.stroke();
      }
      context.setLineDash([2, 8]);
      context.beginPath();
      context.ellipse(0, 0, width * .47, height * .43, -.18, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.restore();
      // Small highlights make the water feel tactile without competing with the marks.
      for (let i = 0; i < 12; i++) {
        const x = width * (.1 + ((i * .137) % .82));
        const y = height * (.19 + ((i * .173) % .66)) + Math.sin(elapsed * .25 + i) * 3;
        context.beginPath();
        context.arc(x, y, i % 3 === 0 ? 3 : 1.8, 0, Math.PI * 2);
        context.strokeStyle = dark ? "rgba(137, 167, 196, .15)" : "rgba(137, 181, 199, .24)";
        context.stroke();
      }
    }

    function draw() {
      if (!context || !width || !height) return;
      context.clearRect(0, 0, width, height);
      drawWater();
      for (const ripple of ripples) {
        const progress = clamp(ripple.age / (ripple.eaten ? .8 : 1.7), 0, 1);
        context.beginPath();
        context.ellipse(ripple.x, ripple.y, 4 + progress * (ripple.eaten ? 20 : 65), 3 + progress * (ripple.eaten ? 14 : 45), 0, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${dark ? "103, 151, 202" : "105, 177, 201"}, ${(1 - progress) * .35})`;
        context.lineWidth = 1;
        context.stroke();
        if (!ripple.eaten) {
          context.beginPath();
          context.ellipse(ripple.x, ripple.y, 3 + progress * 40, 2 + progress * 29, 0, 0, Math.PI * 2);
          context.strokeStyle = `rgba(225, 151, 178, ${(1 - progress) * .26})`;
          context.stroke();
        }
      }
      for (const food of foods) {
        const fade = Math.min(1, (14 - food.age) * 2);
        context.globalAlpha = Math.max(0, fade);
        context.fillStyle = food.pink ? (dark ? "#b45070" : "#edacc4") : (dark ? "#528bc1" : "#89c8dd");
        context.beginPath();
        context.arc(food.x, food.y, 2.7 + Math.sin(food.age * 3 + food.drift) * .5, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
      for (const item of fish) {
        const { x, y, radius: r, angle } = item;
        const pink = item.index % 3 === 1;
        const wiggle = Math.sin(elapsed * 3.6 + item.phase) * .2;
        const bodyColor = dark ? (pink ? "rgba(123, 42, 69, .65)" : "rgba(41, 89, 138, .67)") : (pink ? "rgba(247, 207, 222, .72)" : "rgba(192, 227, 240, .78)");
        const finColor = dark ? (pink ? "rgba(147, 60, 83, .38)" : "rgba(60, 115, 164, .38)") : (pink ? "rgba(244, 202, 219, .55)" : "rgba(184, 222, 236, .55)");
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        // Twin flowing fins sit behind a local vector company mark.
        context.fillStyle = finColor;
        context.beginPath();
        context.moveTo(-r * .76, 0);
        context.bezierCurveTo(-r * 1.15, -r * .25, -r * 1.7, -r * (.68 + wiggle), -r * 1.85, -r * (.6 + wiggle));
        context.quadraticCurveTo(-r * 1.58, 0, -r * 1.85, r * (.6 - wiggle));
        context.bezierCurveTo(-r * 1.4, r * (.6 - wiggle), -r * 1.1, r * .15, -r * .76, 0);
        context.fill();
        context.fillStyle = bodyColor;
        context.beginPath();
        context.ellipse(0, 0, r * 1.05, r * .79, 0, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(-r * .23, -r * .59);
        context.quadraticCurveTo(-r * .18, -r * 1.19, r * .45, -r * .8);
        context.lineTo(r * .6, -r * .5);
        context.fillStyle = finColor;
        context.fill();
        context.beginPath();
        context.moveTo(-r * .23, r * .59);
        context.quadraticCurveTo(-r * .18, r * 1.19, r * .45, r * .8);
        context.lineTo(r * .6, r * .5);
        context.fill();
        if (item.fed > 0 || item.index === hovered) {
          context.strokeStyle = pink ? "rgba(230, 147, 177, .45)" : "rgba(111, 184, 208, .5)";
          context.lineWidth = 1;
          context.beginPath();
          context.ellipse(0, 0, r * 1.19 + item.fed * 3, r * .95 + item.fed * 3, 0, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
        const mark = marksRef.current[item.index];
        if (mark) {
          const size = r * 1.56;
          const markX = x + Math.cos(angle) * r * .13;
          const markY = y + Math.sin(angle) * r * .13;
          mark.style.transform = `translate3d(${markX - size / 2}px, ${markY - size / 2}px, 0) scale(${item.index === hovered ? 1.08 : 1})`;
          mark.style.opacity = "1";
        }
        if (!compact && item.index < 7 && item.index !== hovered) {
          context.font = "500 9px ui-monospace, SFMono-Regular, monospace";
          context.textAlign = "center";
          context.fillStyle = dark ? "rgba(159, 176, 195, .52)" : "rgba(109, 137, 150, .55)";
          context.fillText(identities[item.index].symbol, x, y + r * 1.35 + 7);
        }
      }
    }

    function update(dt: number) {
      const step = dt * 60;
      elapsed += dt;
      for (let i = foods.length - 1; i >= 0; i--) {
        foods[i].age += dt;
        foods[i].x += Math.sin(elapsed + foods[i].drift) * .055 * step;
        foods[i].y += .025 * step;
        if (foods[i].age > 14) foods.splice(i, 1);
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].age += dt;
        if (ripples[i].age > (ripples[i].eaten ? .8 : 1.7)) ripples.splice(i, 1);
      }
      for (const item of fish) {
        let ax = Math.cos(elapsed * .49 + item.phase) * .0025;
        let ay = Math.sin(elapsed * .38 + item.phase) * .0025;
        let neighbors = 0;
        let alignmentX = 0;
        let alignmentY = 0;
        for (const other of fish) {
          if (other === item) continue;
          const dx = item.x - other.x;
          const dy = item.y - other.y;
          const distance = Math.hypot(dx, dy) || 1;
          const space = (item.radius + other.radius) * 1.48;
          if (distance < space) {
            const force = (space - distance) / space * .025;
            ax += dx / distance * force;
            ay += dy / distance * force;
          }
          if (distance < 100) { neighbors++; alignmentX += other.vx; alignmentY += other.vy; }
        }
        if (neighbors) {
          ax += (alignmentX / neighbors - item.vx) * .0018;
          ay += (alignmentY / neighbors - item.vy) * .0018;
        }
        let nearest: Food | undefined;
        let nearestDistance = Infinity;
        for (const food of foods) {
          const distance = Math.hypot(food.x - item.x, food.y - item.y);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = food; }
        }
        const seeking = !!nearest && nearestDistance < Math.max(170, width * .43);
        if (seeking && nearest) {
          if (nearestDistance < item.radius * .62 + 4) {
            foods.splice(foods.indexOf(nearest), 1);
            item.fed = 1;
            ripples.push({ x: nearest.x, y: nearest.y, age: 0, eaten: true });
          } else {
            ax += (nearest.x - item.x) / nearestDistance * .022;
            ay += (nearest.y - item.y) / nearestDistance * .022;
          }
        }
        const marginX = item.radius * 2 + 14;
        const minY = compact ? 44 + item.radius : 65 + item.radius;
        const maxY = height - (compact ? 45 : 69) - item.radius;
        if (item.x < marginX) ax += (marginX - item.x) * .0013;
        if (item.x > width - marginX) ax -= (item.x - width + marginX) * .0013;
        if (item.y < minY) ay += (minY - item.y) * .0013;
        if (item.y > maxY) ay -= (item.y - maxY) * .0013;
        // Gentle orbit returns the school to its flow when feeding is over.
        const centerX = (item.x - width / 2) / Math.max(1, width);
        const centerY = (item.y - height * .51) / Math.max(1, height);
        if (!seeking) { ax += -centerY * .003; ay += centerX * .003; }
        item.vx += ax * step;
        item.vy += ay * step;
        const speed = Math.hypot(item.vx, item.vy) || .01;
        const maxSpeed = seeking ? (compact ? .85 : 1.45) : (compact ? .3 : .55);
        if (speed > maxSpeed) { item.vx = item.vx / speed * maxSpeed; item.vy = item.vy / speed * maxSpeed; }
        item.x = clamp(item.x + item.vx * step, item.radius, width - item.radius);
        item.y = clamp(item.y + item.vy * step, item.radius + 32, height - item.radius - 30);
        const targetAngle = Math.atan2(item.vy, item.vx);
        const difference = Math.atan2(Math.sin(targetAngle - item.angle), Math.cos(targetAngle - item.angle));
        item.angle += difference * Math.min(1, .045 * step);
        item.fed = Math.max(0, item.fed - dt);
      }
    }

    function animate(time: number) {
      if (disposed || reducedMotion || document.hidden || !visible) return;
      const dt = previous ? Math.min((time - previous) / 1000, .035) : .016;
      previous = time;
      update(dt);
      draw();
      animationFrame = window.requestAnimationFrame(animate);
    }

    function start() {
      cancelAnimationFrame(animationFrame);
      previous = 0;
      if (!reducedMotion && !document.hidden && visible) animationFrame = requestAnimationFrame(animate);
      else draw();
    }

    function feed(x: number, y: number) {
      // Bounded particles prevent repeated clicks from creating unbounded work.
      while (foods.length > 42) foods.shift();
      for (let i = 0; i < 8; i++) {
        const angle = i * 2.39996;
        const distance = 6 + (i % 4) * 5;
        foods.push({ x: clamp(x + Math.cos(angle) * distance, 18, width - 18), y: clamp(y + Math.sin(angle) * distance, 35, height - 35), age: 0, pink: i % 2 === 0, drift: i * .8 });
      }
      ripples.push({ x, y, age: 0 });
      if (ripples.length > 15) ripples.splice(0, ripples.length - 15);
      setFeedCount((value) => value + 1);
      if (reducedMotion) {
        const nearest = [...fish].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (nearest) nearest.fed = 1;
        draw();
      }
    }
    feedRef.current = () => feed(width * (.4 + Math.random() * .2), height * (.4 + Math.random() * .18));

    function hitTest(x: number, y: number) {
      return fish.find((item) => Math.hypot(item.x - x, item.y - y) < item.radius * 1.1);
    }
    function onPointerMove(event: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTest(x, y);
      hovered = hit?.index ?? -1;
      if (hit) {
        setTooltip({ company: identities[hit.index], x: clamp(hit.x, 85, width - 85), y: hit.y - hit.radius - 12 });
        canvas.style.cursor = clickRef.current ? "pointer" : "crosshair";
      } else {
        setTooltip(null);
        canvas.style.cursor = "crosshair";
      }
      if (reducedMotion) draw();
    }
    function onPointerLeave() { hovered = -1; setTooltip(null); if (reducedMotion) draw(); }
    function onClick(event: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTest(x, y);
      if (hit && clickRef.current) clickRef.current(identities[hit.index].symbol);
      else feed(x, y);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); feedRef.current(); }
    }
    function onMotionChange() { reducedMotion = motionQuery.matches || document.documentElement.dataset.reducedMotion === "true"; start(); }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }, { threshold: .02 });
    intersectionObserver.observe(container);
    const themeObserver = new MutationObserver(() => {
      dark = document.documentElement.dataset.theme === "dark" || document.documentElement.classList.contains("dark");
      const nextReducedMotion = motionQuery.matches || document.documentElement.dataset.reducedMotion === "true";
      if (nextReducedMotion !== reducedMotion) { reducedMotion = nextReducedMotion; start(); }
      if (reducedMotion) draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-reduced-motion", "class"] });
    motionQuery.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", start);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("keydown", onKey);
    resize();
    start();
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", start);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("keydown", onKey);
      feedRef.current = () => {};
    };
  }, [compact, identities]);

  return (
    <div ref={rootRef} className={`fish-school${compact ? " fish-school--compact" : ""}`}>
      <div className="fish-school__topline">
        <span className="fish-school__eyebrow">A LITTLE MARKET OCEAN</span>
        <span className="fish-school__live"><i />{identities.length} global companies</span>
      </div>
      <div className="fish-school__orbital-label" aria-hidden="true"><span>Ideas in motion</span><strong>stay curious.</strong></div>
      <canvas ref={canvasRef} className="fish-school__canvas" role="button" tabIndex={0} aria-label="Interactive company fish. Click the water or press Space to feed. This illustrative school is not a live market-cap ranking." />
      <div className="fish-school__marks" aria-hidden="true">
        {identities.map((company, index) => <span key={company.symbol} ref={(element) => { marksRef.current[index] = element; }} className="fish-school__mark" style={{ "--fish-size": "40px" } as CSSProperties}>
          <CompanyMark symbol={company.symbol} mark={company.mark} color={company.color} size={compact ? (index < 7 ? 17 : 12) : (index < 7 ? 26 : 18)} />
        </span>)}
      </div>
      {tooltip && <div className="fish-school__tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.company.nameEn || tooltip.company.name}<strong>{tooltip.company.symbol}</strong></div>}
      <div className="fish-school__footer">
        <span className="fish-school__hint"><svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true"><path d="m3 2 8 7-4 .5L5 13 3 2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="m9 2 1-1m1 4h2M6 1V0" stroke="currentColor" strokeLinecap="round" /></svg>{compact ? "A little curiosity goes a long way." : "Click the water. Follow your curiosity."}</span>
        <button type="button" className="fish-school__feed" onClick={() => feedRef.current()} aria-label="Feed the company fish"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5c4 0 7 4.5 7 4.5s-3 4.5-7 4.5c-1 0-2-.6-2.8-1.3L1 12V4l2.2.8C4 4.1 5 3.5 6 3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="9.5" cy="7" r=".8" fill="currentColor" /></svg>Feed the fish</button>
      </div>
      <span role="status" aria-live="polite" className="fish-school__sr-only">{feedCount > 0 ? `Food added ${feedCount} ${feedCount === 1 ? "time" : "times"}. Nearby fish have been fed.` : ""}</span>
    </div>
  );
}
