import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function StoreCarousel(props: { images: string[]; headline?: string | null }): ReactElement | null {
  const images = props.images.filter(Boolean);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [images.length]);

  if (images.length === 0) {
    return (
      <section className="relative overflow-hidden bg-muted/40">
        <div className="mx-auto flex aspect-[21/9] max-w-6xl items-center justify-center px-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-primary">Welcome</p>
            {props.headline && (
              <p className="mt-2 max-w-xl text-lg text-muted-foreground">{props.headline}</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const prev = (): void => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = (): void => setIndex((i) => (i + 1) % images.length);

  return (
    <section className="relative overflow-hidden bg-muted">
      <div className="relative aspect-[21/9] max-h-[420px] w-full">
        {images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        {props.headline && (
          <div className="absolute bottom-6 left-0 right-0 px-6 text-center">
            <p className="text-lg font-medium text-white drop-shadow md:text-xl">{props.headline}</p>
          </div>
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`h-2 w-2 rounded-full transition ${
                    i === index ? "bg-white" : "bg-white/40"
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
