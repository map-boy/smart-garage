import { useEffect, useRef, useState, type CSSProperties } from "react";

/** A shimmering bar. Sized by props so a skeleton matches the layout it stands in for. */
export function Skel({ w = "100%", h = 14, mt = 0 }: { w?: string | number; h?: number; mt?: number }) {
  return <span className="skel" aria-hidden="true" style={{ width: w, height: h, marginTop: mt, borderRadius: 4 }} />;
}

/** Stands in for a service card while the live content loads. Same size as the real one. */
export function CardSkeleton() {
  return (
    <article className="card card-skel" aria-hidden="true">
      <div className="skel" style={{ height: 190 }} />
      <div className="b">
        <Skel w="55%" h={18} />
        <Skel h={12} mt={14} />
        <Skel w="85%" h={12} mt={8} />
        <Skel w="30%" h={16} mt={18} />
      </div>
    </article>
  );
}

/**
 * An image that holds its space, shows a shimmer (or a blurred preview) while it
 * downloads, and fades in when ready. A broken image degrades to a flat block.
 */
export function SmartImg({ src, alt, className = "", ratio, blur, priority }: {
  src?: string; alt: string; className?: string; ratio?: number; blur?: string; priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
    const el = ref.current;
    setLoaded(!!el && el.complete && el.naturalWidth > 0);
  }, [src]);

  const style: CSSProperties = {};
  if (ratio) style.aspectRatio = String(ratio);
  if (blur) style.backgroundImage = `url("${blur}")`;

  return (
    <span className={`simg ${className}${loaded ? " loaded" : ""}${failed || !src ? " failed" : ""}`} style={style}>
      {src && !failed && (
        <img ref={ref} src={src} alt={alt} decoding="async"
          loading={priority ? "eager" : "lazy"}
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
    </span>
  );
}