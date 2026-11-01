import { mediaUrl } from "@/lib/media";

export function Portrait({ path, name, className }: { path: string; name: string; className?: string }) {
  const src = mediaUrl(path);
  const letters =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "EA";
  if (!src) {
    return (
      <div className={`grid place-items-center bg-[#172033] font-semibold tracking-wide text-white ${className ?? ""}`} aria-hidden>
        {letters}
      </div>
    );
  }
  return <img src={src} alt={`${name} photo`} className={`object-cover ${className ?? ""}`} />;
}
