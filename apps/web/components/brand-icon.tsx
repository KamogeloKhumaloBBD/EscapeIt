import Image from "next/image";

export function BrandIcon({ className }: { className?: string }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={className}
      height={32}
      src="/icon.svg"
      width={32}
    />
  );
}
