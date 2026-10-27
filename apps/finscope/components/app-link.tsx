import type { AnchorHTMLAttributes } from 'react';

// Use document navigation: the deployed Vinext client router cannot reliably
// hydrate its RSC transition helpers. Native links also preserve browser history,
// modified clicks and open-in-new-tab without depending on client JavaScript.
export default function AppLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props}/>;
}
