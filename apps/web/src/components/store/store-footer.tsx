import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  Phone,
  Youtube,
} from "lucide-react";
import type { Storefront } from "@/lib/store-public";

function SocialIcon(props: { href: string; label: string; children: ReactElement }): ReactElement {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={props.label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      {props.children}
    </a>
  );
}

export function StoreFooter(props: { store: Storefront; slug: string }): ReactElement {
  const { store, slug } = props;
  const social = store.storeSocialLinks ?? {};
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="space-y-3">
          {store.storeLogoUrl ? (
            <img src={store.storeLogoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
              {store.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <p className="font-semibold">{store.name}</p>
          {store.storeHeadline && (
            <p className="text-sm text-muted-foreground">{store.storeHeadline}</p>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Contact</p>
          {store.storePhone && (
            <a
              href={`tel:${store.storePhone.replace(/\s/g, "")}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-4 w-4 shrink-0" />
              {store.storePhone}
            </a>
          )}
          {store.storeContactEmail && (
            <a
              href={`mailto:${store.storeContactEmail}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0" />
              {store.storeContactEmail}
            </a>
          )}
          {!store.storePhone && !store.storeContactEmail && (
            <p className="text-muted-foreground">Contact details not set.</p>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Policies</p>
          <ul className="space-y-1 text-muted-foreground">
            {store.hasTerms ? (
              <li>
                <Link to={`/store/${slug}/legal/terms`} className="hover:text-foreground">
                  Terms &amp; conditions
                </Link>
              </li>
            ) : null}
            {store.hasPrivacy ? (
              <li>
                <Link to={`/store/${slug}/legal/privacy`} className="hover:text-foreground">
                  Privacy policy
                </Link>
              </li>
            ) : null}
            {store.hasRefundPolicy ? (
              <li>
                <Link to={`/store/${slug}/legal/refund`} className="hover:text-foreground">
                  Refund policy
                </Link>
              </li>
            ) : null}
            {!store.hasTerms && !store.hasPrivacy && !store.hasRefundPolicy && (
              <li className="text-muted-foreground">No policies published yet.</li>
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Follow us</p>
          <div className="flex flex-wrap gap-2">
            {social.facebook && (
              <SocialIcon href={social.facebook} label="Facebook">
                <Facebook className="h-4 w-4" />
              </SocialIcon>
            )}
            {social.instagram && (
              <SocialIcon href={social.instagram} label="Instagram">
                <Instagram className="h-4 w-4" />
              </SocialIcon>
            )}
            {social.twitter && (
              <SocialIcon href={social.twitter} label="Twitter">
                <span className="text-xs font-bold">X</span>
              </SocialIcon>
            )}
            {social.tiktok && (
              <SocialIcon href={social.tiktok} label="TikTok">
                <span className="text-xs font-bold">TT</span>
              </SocialIcon>
            )}
            {social.linkedin && (
              <SocialIcon href={social.linkedin} label="LinkedIn">
                <Linkedin className="h-4 w-4" />
              </SocialIcon>
            )}
            {social.youtube && (
              <SocialIcon href={social.youtube} label="YouTube">
                <Youtube className="h-4 w-4" />
              </SocialIcon>
            )}
            {social.whatsapp && (
              <SocialIcon href={social.whatsapp} label="WhatsApp">
                <span className="text-xs font-bold">WA</span>
              </SocialIcon>
            )}
            {!social.facebook &&
              !social.instagram &&
              !social.twitter &&
              !social.tiktok &&
              !social.linkedin &&
              !social.youtube &&
              !social.whatsapp && (
                <p className="text-sm text-muted-foreground">No social links yet.</p>
              )}
          </div>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {year} {store.name}. All rights reserved.
      </div>
    </footer>
  );
}
