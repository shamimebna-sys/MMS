import { isImagePath, mediaUrl, storedFiles } from "@/lib/media";

export function FileValue({ value, className = "h-16 w-12 rounded-lg object-cover" }: { value: string; className?: string }) {
  const files = storedFiles(value);
  if (files.length === 0) return value ? value : "—";
  return (
    <span className="flex flex-wrap items-center gap-2">
      {files.map((file) => {
        const href = mediaUrl(file.path);
        if (!href) return <span key={file.path}>{file.name || file.path}</span>;
        if (isImagePath(file.path)) {
          return (
            <a key={file.path} href={href} target="_blank" rel="noreferrer" className="inline-grid gap-1 text-xs text-muted">
              <img src={href} alt={file.name || "File"} className={className} />
              {file.name ? <span>{file.name}</span> : null}
            </a>
          );
        }
        return (
          <a key={file.path} href={href} className="text-accent" target="_blank" rel="noreferrer">
            {file.name || "View"}
          </a>
        );
      })}
    </span>
  );
}
