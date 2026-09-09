"use client";

import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => {
    query.removeEventListener("change", callback);
  };
}
function reducedMotion() {
  return window.matchMedia(motionQuery).matches;
}
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => {
    document.removeEventListener("visibilitychange", callback);
  };
}
function documentVisible() {
  return document.visibilityState === "visible";
}
function staticSnapshot() {
  return true;
}

/** One clock per scene. Time is retained while paused or outside the viewport. */
export function useSceneClock(
  duration: number,
  ref: RefObject<HTMLElement | null>,
) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    reducedMotion,
    staticSnapshot,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    documentVisible,
    staticSnapshot,
  );
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(0);
  const elapsed = useRef(0);
  const running = inView && visible && !paused && !reduced;

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(
          (entry?.isIntersecting ?? false) &&
            (entry?.intersectionRatio ?? 0) >= 0.15,
        );
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  useEffect(() => {
    if (!running) return;
    let previous: number | null = null;
    let published = 0;
    let frame = 0;
    function tick(now: number) {
      if (previous !== null)
        elapsed.current =
          (elapsed.current + Math.min(now - previous, 100) / 1000) % duration;
      previous = now;
      // 30 updates/second is sufficient for these small explanatory diagrams.
      if (now - published >= 32) {
        setTime(elapsed.current);
        published = now;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [running, duration]);

  return {
    paused,
    reduced,
    running,
    time: reduced ? duration - 0.01 : time,
    toggle: () => {
      setPaused((value) => !value);
    },
    restart: () => {
      elapsed.current = 0;
      setTime(0);
    },
  };
}

export function Playback({
  name,
  clock,
}: {
  name: string;
  clock: ReturnType<typeof useSceneClock>;
}) {
  return (
    <div className="scene-playback shrink-0 [&>span]:text-[0.625rem] [&_button]:h-8 [&_button]:px-[9px] [&_button]:text-[0.6875rem] [&_button]:text-inherit [&_button_svg]:size-3">
      {clock.reduced ? (
        <span>Still view · reduced motion</span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={clock.toggle}
          aria-label={`${clock.paused ? "Play" : "Pause"} ${name} animation`}
        >
          {clock.paused ? (
            <PlayIcon aria-hidden="true" />
          ) : (
            <PauseIcon aria-hidden="true" />
          )}
          {clock.paused ? "Play" : "Pause"}
        </Button>
      )}
    </div>
  );
}

interface Point {
  x: number;
  y: number;
}
interface Curve {
  start: Point;
  first: Point;
  second: Point;
  end: Point;
  gutter: number | undefined;
}
type Port = "top" | "right" | "bottom" | "left";
export interface SceneRoute {
  id: string;
  from: string;
  to: string;
  fromPort?: Port;
  toPort?: Port;
  verticalFrom?: Port;
  verticalTo?: Port;
  mobileGutter?: number;
  tone?: "purple" | "green" | "amber";
  dashed?: boolean;
  signals?: readonly { start: number; end: number; reverse?: boolean }[];
}

function anchor(rect: DOMRect, origin: DOMRect, port: Port): Point {
  return {
    x:
      rect.left -
      origin.left +
      (port === "left" ? 0 : port === "right" ? rect.width : rect.width / 2),
    y:
      rect.top -
      origin.top +
      (port === "top" ? 0 : port === "bottom" ? rect.height : rect.height / 2),
  };
}
function control(point: Point, port: Port, distance: number): Point {
  return {
    x:
      point.x + (port === "right" ? distance : port === "left" ? -distance : 0),
    y:
      point.y + (port === "bottom" ? distance : port === "top" ? -distance : 0),
  };
}
function pointOnCurve(curve: Curve, t: number): Point {
  if (curve.gutter !== undefined) {
    const points = [
      curve.start,
      { x: curve.gutter, y: curve.start.y },
      { x: curve.gutter, y: curve.end.y },
      curve.end,
    ];
    const lengths = [
      Math.abs(curve.start.x - curve.gutter),
      Math.abs(curve.end.y - curve.start.y),
      Math.abs(curve.end.x - curve.gutter),
    ];
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * t;
    for (let index = 0; index < lengths.length; index++) {
      const length = lengths[index] ?? 0;
      const from = points[index] ?? curve.start;
      const to = points[index + 1] ?? curve.end;
      if (remaining <= length && length > 0)
        return {
          x: from.x + ((to.x - from.x) * remaining) / length,
          y: from.y + ((to.y - from.y) * remaining) / length,
        };
      remaining -= length;
    }
    return curve.end;
  }
  const u = 1 - t;
  return {
    x:
      u ** 3 * curve.start.x +
      3 * u ** 2 * t * curve.first.x +
      3 * u * t ** 2 * curve.second.x +
      t ** 3 * curve.end.x,
    y:
      u ** 3 * curve.start.y +
      3 * u ** 2 * t * curve.first.y +
      3 * u * t ** 2 * curve.second.y +
      t ** 3 * curve.end.y,
  };
}

/** Connect the actual node edges, including after fonts load and mobile reflow. */
export function ScenePaths({
  container,
  routes,
  time,
}: {
  container: RefObject<HTMLDivElement | null>;
  routes: readonly SceneRoute[];
  time: number;
}) {
  const [curves, setCurves] = useState<Record<string, Curve>>({});
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const scaleX = origin.width / element.offsetWidth || 1;
      const scaleY = origin.height / element.offsetHeight || 1;
      const vertical =
        (element.closest("figure")?.clientWidth ?? element.clientWidth) < 640;
      const next: Record<string, Curve> = {};
      for (const route of routes) {
        const from = element.querySelector(`[data-node="${route.from}"]`);
        const to = element.querySelector(`[data-node="${route.to}"]`);
        if (from === null || to === null) continue;
        const fromPort = vertical
          ? (route.verticalFrom ?? "bottom")
          : (route.fromPort ?? "right");
        const toPort = vertical
          ? (route.verticalTo ?? "top")
          : (route.toPort ?? "left");
        const start = anchor(from.getBoundingClientRect(), origin, fromPort);
        const end = anchor(to.getBoundingClientRect(), origin, toPort);
        start.x /= scaleX;
        start.y /= scaleY;
        end.x /= scaleX;
        end.y /= scaleY;
        const distance = Math.max(
          24,
          Math.min(90, Math.hypot(end.x - start.x, end.y - start.y) * 0.4),
        );
        next[route.id] = {
          start,
          first: control(start, fromPort, distance),
          second: control(end, toPort, distance),
          end,
          gutter: vertical ? route.mobileGutter : undefined,
        };
      }
      setCurves(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll("[data-node]").forEach((node) => {
      observer.observe(node);
    });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [container, routes]);

  return (
    <svg
      className="scene-paths pointer-events-none absolute inset-0 z-1 size-full overflow-visible [&_path]:fill-none [&_path]:stroke-current [&_path]:stroke-[1.3] [&_path]:opacity-40 [&_circle]:fill-current"
      aria-hidden="true"
    >
      {routes.map((route) => {
        const curve = curves[route.id];
        if (curve === undefined) return null;
        const { start, first, second, end } = curve;
        const signal = route.signals?.find(
          (segment) => time >= segment.start && time < segment.end,
        );
        const progress =
          signal === undefined
            ? 0
            : (time - signal.start) / (signal.end - signal.start);
        const point = pointOnCurve(
          curve,
          signal?.reverse === true ? 1 - progress : progress,
        );
        return (
          <g
            key={route.id}
            data-route={route.id}
            className={`scene-route ${route.tone === "amber" ? "text-[#b98136]" : route.tone === "green" ? "text-[#389a6e]" : "text-[#8b76db]"}`}
          >
            <path
              d={
                curve.gutter === undefined
                  ? `M ${String(start.x)} ${String(start.y)} C ${String(first.x)} ${String(first.y)}, ${String(second.x)} ${String(second.y)}, ${String(end.x)} ${String(end.y)}`
                  : `M ${String(start.x)} ${String(start.y)} H ${String(curve.gutter)} V ${String(end.y)} H ${String(end.x)}`
              }
              strokeDasharray={route.dashed === true ? "4 5" : undefined}
            />
            {signal !== undefined && (
              <g>
                <circle cx={point.x} cy={point.y} r="8" opacity="0.12" />
                <circle cx={point.x} cy={point.y} r="3.5" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
