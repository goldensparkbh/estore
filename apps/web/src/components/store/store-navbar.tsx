import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Storefront } from "@/lib/store-public";

export function StoreNavbar(props: {
  store: Storefront;
  slug: string;
  active?: "home" | "shop" | "contact";
}): ReactElement {
  const { store, slug } = props;
  const linkClass = (key: "home" | "shop" | "contact") =>
    `text-sm font-medium transition hover:text-primary ${
      props.active === key ? "text-primary" : "text-muted-foreground"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to={`/store/${slug}`} className="flex min-w-0 items-center gap-3">
          {store.storeLogoUrl ? (
            <img
              src={store.storeLogoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
              {store.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="truncate font-semibold">{store.name}</span>
        </Link>
        <nav className="hidden items-center gap-6 sm:flex">
          <Link to={`/store/${slug}`} className={linkClass("home")}>
            Home
          </Link>
          <Link to={`/store/${slug}/shop`} className={linkClass("shop")}>
            Shop
          </Link>
          <a href={`/store/${slug}#contact`} className={linkClass("contact")}>
            Contact us
          </a>
        </nav>
        <Button asChild size="sm" className="shrink-0">
          <Link to={`/store/${slug}/shop`}>
            <ShoppingBag className="mr-1 h-4 w-4" />
            Shop
          </Link>
        </Button>
      </div>
    </header>
  );
}
