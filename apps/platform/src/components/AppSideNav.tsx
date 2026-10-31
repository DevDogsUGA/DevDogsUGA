import { Fragment } from "react";
import { getNavUser } from "~/components/TopNav/data";
import * as icons from "~/config/icons";
import { DASHBOARD_GROUPS } from "~/config/dashboard";
import { loadCaller } from "~/server/auth/access";
import { visibleSections } from "~/server/dashboard/sections";
import { Avatar, AvatarFallback } from "~/ui/avatar";
import { SideWho } from "~/ui/app-shell";
import { SideNav, SideNavGroup } from "~/ui/side-nav";
import DashboardNavLink from "./DashboardNavLink";
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Filter permissions on the server and leave active state to the client. */
export default async function AppSideNav() {
  const [user, caller] = await Promise.all([getNavUser(), loadCaller()]);
  const sections = visibleSections(caller);
  return (
    <>
      {user && (
        <SideWho
          avatar={
            <Avatar>
              <AvatarFallback>
                {initials(user.profile.preferredName)}
              </AvatarFallback>
            </Avatar>
          }
          name={user.profile.preferredName}
          handle={user.highestRole.title}
        />
      )}
      <SideNav aria-label="Dashboard">
        {DASHBOARD_GROUPS.map((group) => {
          const entries = sections.filter((section) => section.group === group);
          return (
            entries.length > 0 && (
              <Fragment key={group}>
                <SideNavGroup>{group}</SideNavGroup>
                {entries.map((section) => {
                  const Icon = icons[section.icon];
                  return (
                    <DashboardNavLink
                      key={section.id}
                      href={section.href}
                      icon={<Icon />}
                      exact={section.group === "Overview"}
                    >
                      {section.label}
                    </DashboardNavLink>
                  );
                })}
              </Fragment>
            )
          );
        })}
      </SideNav>
    </>
  );
}
