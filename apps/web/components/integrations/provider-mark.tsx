"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

const sizes = {
  sm: { box: "size-9", image: 36, text: "text-sm" },
  md: { box: "size-12", image: 48, text: "text-base" },
  lg: { box: "size-16", image: 64, text: "text-xl" },
} as const;

export function ProviderMark({
  className,
  displayName,
  provider,
  size = "md",
}: {
  className?: string;
  displayName: string;
  provider: string;
  size?: keyof typeof sizes;
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = sizes[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden",
        dimensions.box,
        className,
      )}
    >
      {failed ? (
        <span
          className={cn(
            "grid size-full place-items-center bg-primary font-semibold text-primary-foreground",
            dimensions.text,
          )}
        >
          {displayName.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <Image
          alt=""
          height={dimensions.image}
          onError={() => {
            setFailed(true);
          }}
          src={`/provider-logos/${encodeURIComponent(provider)}.svg`}
          width={dimensions.image}
        />
      )}
    </span>
  );
}
