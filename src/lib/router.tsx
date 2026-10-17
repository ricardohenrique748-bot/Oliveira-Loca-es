import React from "react";
import {
  Link as RouterLink,
  useNavigate,
  useLocation,
  useSearchParams as useRouterSearchParams,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";

export interface LinkProps extends Omit<RouterLinkProps, "to"> {
  href?: string;
  to?: string;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, to, children, ...props }, ref) => {
    const target = to || href || "#";
    return (
      <RouterLink ref={ref} to={target} {...props}>
        {children}
      </RouterLink>
    );
  }
);
Link.displayName = "Link";

export default Link;

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (url: string, _opts?: unknown) => navigate(url),
    replace: (url: string, _opts?: unknown) => navigate(url, { replace: true }),
    refresh: () => {
      window.dispatchEvent(new CustomEvent("oliveira:refresh"));
    },
    back: () => navigate(-1),
    forward: () => navigate(1),
  };
}

export function usePathname(): string {
  const location = useLocation();
  return location.pathname;
}

export function useSearchParams() {
  const [searchParams] = useRouterSearchParams();
  return searchParams;
}

export function redirect(to: string) {
  if (typeof window !== "undefined") {
    window.location.href = to;
  }
}

export function notFound() {
  return null;
}
