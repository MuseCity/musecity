import { Link, useLocation } from "react-router";
import { siteBuilders } from "../shared/site-builders";

export function SiteBuilderLinks() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Website builders"
      className="flex flex-wrap gap-x-5 gap-y-2 my-4 text-sm"
    >
      <Link
        className="text-link"
        to="/?view=sites"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        All AI websites
      </Link>
      {siteBuilders.map((builder) => (
        <Link
          key={builder.id}
          className="text-link"
          to={builder.path}
          aria-current={pathname === builder.path ? "page" : undefined}
        >
          {builder.name}
        </Link>
      ))}
    </nav>
  );
}
